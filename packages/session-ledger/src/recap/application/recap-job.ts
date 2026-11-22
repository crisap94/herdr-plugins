import { brand } from '#src/recap/domain/brand.ts';
import type { Count } from '#src/contract/kernel.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Lane, TabId } from '#src/recap/domain/lane-shape.ts';
import type { RecapCause } from '#src/recap/domain/recap-cause.ts';
import type { TranscriptRegistry } from '#src/ports/transcript-registry.ts';
import type { Clock } from '#src/ports/clock.ts';
import type { FactId } from '#src/recap/domain/fact.ts';
import type { LaneRepo } from '#src/ports/lane-repo.ts';
import type { CheckedLedger } from '#src/ports/ledger.ts';
import { blankRecap, hasRecap, type CheckedRecapRecords, type LaneCursor, type RecordedRun, type TabRecap } from '#src/ports/recap-records.ts';
import type { RecapRequest, Summarizer } from '#src/ports/summarizer.ts';
import { UNREAD, sourcePathOf } from '#src/ports/transcripts.ts';
import { isUnknown, saying, type Unknown } from '#src/ports/unknowable.ts';
import type { Enumerators } from '#src/ports/enumerators.ts';
import { DEFAULT_PIPELINE, type CloseEvidence, type Pipeline } from '#src/recap/domain/pipeline.ts';
import { DEBOUNCE_OFF, type Debounce } from '#src/recap/domain/debounce.ts';
import { PACING_TURN, type Pacing, type Shown, type SmartPacing } from '#src/recap/domain/pacing.ts';
import type { FlushWhy } from '#src/contract/engine.ts';
import { AT_ONCE, laneSet, pacedOf, pendingOf, type Pending } from './pending-plan.ts';
import { keptGrouping, type PlacedLane } from '#src/recap/domain/grouping.ts';
import { taskFactsOf } from './ledger-input.ts';
import { groundOf } from './extract-ground.ts';
import type { Extracted, Ground } from './extract-job.ts';
import { extractPiped } from './extract-pipeline.ts';
import type { RunEvent } from './ledger-reconcile.ts';
import { instant } from '#src/recap/domain/time.ts';
import { ADVANCED, marksOf, NOT_ADVANCED } from './boundaries.ts';
import type { WriterView } from '#src/recap/domain/writer-view.ts';
import { FRESH, inputOf, SEEN_BEFORE } from './recap-input.ts';
import { writerContext } from './writer-context.ts';
import { accomplishedOf, foldedRun, throwingLedger } from './run-fold.ts';
import { CursorCarry } from './cursor-carry.ts';

import { type KeepInput, type Located, type Plan, type Prepared, type Reading, type Run, type Slot, type WrittenRun } from './recap-job-parts.ts';

export type { KeepInput } from './recap-job-parts.ts';
const [textOf, count, usd, grew, switched] = [brand<string, 'Text'>, brand<number, 'Count'>, brand<number, 'Usd'>, brand<boolean, 'Grew'>, brand<boolean, 'Switched'>];
export interface RecapJobDeps {
    readonly transcripts: TranscriptRegistry;
    readonly records: CheckedRecapRecords;
    readonly ledger: CheckedLedger;
    readonly repos: LaneRepo;
    readonly clock: Clock;
    summarizer(): Summarizer;
    language(): Text;
    keepInput?(): KeepInput;
    pipeline?(): Pipeline;
    closeEvidence?(): CloseEvidence;
    writerView(): WriterView;
    debounce?(): Debounce;
    pacing?(): Pacing;
    visible?(tab: TabId): Shown;
    enumerator?(): Enumerators | null;
    ran?(event: RunEvent): void;
    mint(): FactId;
    log(line: string): void;
}

const READ_BUDGET = 768 * 1024;
async function placeOf(seat: Lane, repos: LaneRepo): Promise<PlacedLane> {
    const found = seat.cwd === null ? null : await repos.repoOf(seat.cwd);
    return { pane: String(seat.pane), place: found?.kind === 'repo' ? found.root : seat.cwd };
}

export class RecapJob {
    private readonly deps: RecapJobDeps;
    private readonly slots = new Map<string, Slot>();
    private readonly carry = new CursorCarry();

    constructor(deps: RecapJobDeps) { this.deps = deps; }

    request(tab: TabId, lanes: readonly Lane[], cause: RecapCause): void {
        const key = String(tab);
        const slot: Slot = this.slots.get(key) ?? { tab, timer: null, flight: 'idle', pending: null, lastStart: null, lastLanes: new Set(), waiting: [], deferred: 'none' };
        this.slots.set(key, slot);
        const pacing = this.deps.pacing?.() ?? PACING_TURN;
        if (pacing.kind === 'smart') this.paced(slot, tab, lanes, cause, pacing);
        else slot.pending = pendingOf(slot, lanes, cause, this.deps.debounce?.() ?? DEBOUNCE_OFF, () => this.deps.clock.now());
        this.hurry(slot);
        this.arm(slot, tab);
    }

    private paced(slot: Slot, scope: TabId, lanes: Pending['lanes'], cause: RecapCause, pacing: SmartPacing): void {
        const shown = this.deps.visible?.(scope) ?? 'shown';
        slot.pending = pacedOf(slot, lanes, cause, { pacing, shown, now: this.deps.clock.now() });
        if (shown !== 'hidden' || slot.deferred === 'deferred' || slot.pending.urge !== 'paced' || slot.pending.start.kind !== 'at' || lanes.some((seat) => seat.status === 'blocked')) return;
        slot.deferred = 'deferred';
        this.deps.log(`recap ${String(scope)}: deferred (not visible)`);
    }

    flush(scope: TabId, why: FlushWhy = 'requested'): Promise<void> {
        const slot = this.slots.get(String(scope));
        if (slot !== undefined) this.release(slot, why);
        return this.idle(scope);
    }

    async flushAll(): Promise<void> {
        const slots = [...this.slots.values()];
        for (const slot of slots) this.release(slot, 'shutdown');
        await Promise.all(slots.map((slot) => this.idle(slot.tab)));
    }

    private release(slot: Slot, why: FlushWhy): void {
        if (slot.pending === null) return;
        if (slot.pending.start.kind === 'at') this.deps.log(`recap ${String(slot.tab)}: flushed (${why})`);
        slot.pending = { ...slot.pending, start: AT_ONCE };
        this.arm(slot, slot.tab);
    }

    private arm(slot: Slot, tab: TabId): void {
        if (slot.flight === 'flying') return;
        if (slot.timer !== null) clearTimeout(slot.timer);
        const pending = slot.pending;
        if (pending === null) return;
        slot.timer = setTimeout(() => {
            slot.pending = null;
            void this.fly(slot, tab, pending);
        }, pending.start.kind === 'after' ? pending.start.delay : Math.max(0, pending.start.deadline - Number(this.deps.clock.now())));
    }

    private async fly(slot: Slot, tab: TabId, pending: Pending): Promise<void> {
        slot.timer = null;
        slot.flight = 'flying';
        slot.deferred = 'none';
        const covered = pending.start.kind === 'at' ? slot.waiting.splice(0) : [];
        const run: Run = { started: (at) => { slot.lastStart = at; slot.lastLanes = laneSet(pending.lanes); }, advanced: (readings) => { if (readings.some((r) => r.chunk?.more === true) && slot.pending === null) slot.pending = { lanes: pending.lanes, cause: pending.cause, urge: 'forced', start: AT_ONCE, burst: null }; } };
        try {
            await this.recap(tab, pending.lanes, pending.cause, run);
        } catch (error) {
            this.deps.log(`recap ${tab}: ${error instanceof Error ? error.message : String(error)}`);
        }
        slot.flight = 'idle';
        const done = slot.pending === null ? [...covered, ...slot.waiting.splice(0)] : covered;
        for (const finish of done) finish();
        this.hurry(slot);
        if (slot.pending !== null) this.arm(slot, tab);
    }

    private hurry(slot: Slot): void {
        if (slot.pending !== null && slot.pending.burst !== null && slot.waiting.length > 0) slot.pending = { ...slot.pending, start: AT_ONCE };
    }

    refreshNow(tab: TabId, lanes: readonly Lane[]): Promise<void> { this.request(tab, lanes, 'requested'); return this.idle(tab); }

    idle(scope: TabId): Promise<void> {
        const slot = this.slots.get(String(scope));
        return slot === undefined || (slot.flight === 'idle' && slot.timer === null) ? Promise.resolve() : new Promise((resolve) => { slot.waiting.push(resolve); });
    }

    private async locate(lane: Lane): Promise<Located | Text> {
        const agent = lane.agent;
        const reader = this.deps.transcripts.readerFor(agent);
        if (reader === undefined) return this.deps.transcripts.unavailableReason(agent);
        const located = await reader.locate(lane);
        return isUnknown(located) ? saying(located.why) : { reader, source: located.source };
    }

    private async read(lane: Lane, prior: TabRecap, budget: Count): Promise<Reading> {
        const blank: LaneCursor = { pane: lane.pane, agent: lane.agent, transcript: sourcePathOf(''), cursor: UNREAD.cursor, tail: UNREAD.tail, title: lane.title === null ? null : textOf(lane.title), lastPrompt: null, claudeRecap: null };
        const found = await this.locate(lane);
        if (typeof found === 'string') return { lane, cursor: blank, chunk: null, grew: grew(false), fresh: SEEN_BEFORE, error: found };
        const was = await this.carry.cursorFor({ session: lane.session, cursors: prior.lanes.filter((c) => c.pane === blank.pane), wanted: { ...blank, transcript: found.source }, reader: found.reader });
        const chunk = await found.reader.read(found.source, { cursor: was.cursor, tail: was.tail }, budget);
        if (isUnknown(chunk)) return { lane, cursor: was, chunk: null, grew: grew(false), fresh: SEEN_BEFORE, error: saying(chunk.why) };
        const cursor: LaneCursor = { ...was, title: chunk.title ?? was.title, lastPrompt: chunk.lastPrompt ?? was.lastPrompt, claudeRecap: chunk.claudeRecap ?? was.claudeRecap };
        return { lane, cursor, chunk, grew: chunk.grew, fresh: was.cursor === UNREAD.cursor ? FRESH : SEEN_BEFORE, error: null };
    }

    private async readAll(prior: TabRecap, lanes: readonly Lane[], cause: RecapCause): Promise<readonly Reading[]> {
        const budget = count(Math.floor(READ_BUDGET / Math.max(1, lanes.length)));
        try {
            return await Promise.all(lanes.map((each) => this.read(each, prior, budget)));
        } catch (error) {
            const facts = { tab: prior.tab, at: this.deps.clock.now(), cause, backend: this.deps.summarizer().backend, costUsd: usd(0) };
            this.deps.records.beginRun(facts.tab, facts.backend, facts.at);
            this.deps.records.failRun({ ...facts, language: hasRecap(prior) ? prior.language : this.deps.language(), error: textOf(error instanceof Error ? error.message : String(error)), lanes: prior.lanes });
            throw error;
        }
    }

    private async recap(tab: TabId, lanes: readonly Lane[], cause: RecapCause, run: Run): Promise<void> {
        const prior = this.deps.records.readRecap(tab) ?? blankRecap(tab);
        if ('kind' in prior) return this.skipped(tab, prior);
        const found = this.deps.ledger.keysOf(tab);
        if ('kind' in found) return this.skipped(tab, found);
        const keys = found.map(textOf);
        const want = this.deps.language();
        const moved = this.switchedOf(prior, keys, want, cause);
        if (typeof moved !== 'boolean') return this.skipped(tab, moved);
        const readings = await this.readAll(prior, lanes, cause);
        if (cause === 'focused' && hasRecap(prior) && !moved && !readings.some((r) => r.grew)) return;
        await this.summarize(prior, readings, { want, was: hasRecap(prior) ? textOf(prior.language) : want, switched: switched(moved), cause, keys }, run);
    }

    private skipped(tab: TabId, failure: Unknown): void { this.deps.log(`recap ${String(tab)}: skipped, ${saying(failure.why)}`); }

    private switchedOf(prior: TabRecap, keys: readonly Text[], want: Text, cause: RecapCause): boolean | Unknown {
        if (!hasRecap(prior)) return false;
        if (prior.language !== want) return true;
        if (cause === 'focused') return false;
        for (const key of keys) {
            const open = this.deps.ledger.openOf({ tab: prior.tab, key });
            if ('kind' in open) return open;
            if (open.some((fact) => fact.language !== want)) return true;
        }
        return false;
    }

    private async piped(summarizer: Summarizer, request: RecapRequest, ground: Ground): Promise<Extracted> {
        const { deps } = this;
        const closeEvidence = deps.closeEvidence?.() ?? 'off';
        try {
            return await extractPiped(summarizer, { ...request, closeEvidence }, ground, { pipeline: deps.pipeline?.() ?? DEFAULT_PIPELINE, enumerator: deps.enumerator?.() ?? null, closeEvidence, log: (line) => { deps.log(line); } });
        } catch (error) {
            const text = error instanceof Error ? error.message : String(error);
            deps.log(`recap writer: ${text}`);
            return { kind: 'failed', error: textOf(text), cost: usd(0) };
        }
    }

    private async prepared(prior: TabRecap, readings: readonly Reading[], plan: Plan): Promise<Prepared> {
        const now = this.deps.clock.now(); const ledger = throwingLedger(this.deps.ledger);
        const tasks = keptGrouping(prior.tasks, await Promise.all(readings.map((r) => placeOf(r.lane, this.deps.repos))), plan.keys);
        const writerView = this.deps.writerView(); const facts = tasks.map((task) => taskFactsOf(ledger, { tab: prior.tab, key: task.id }, now));
        const stale = facts.flatMap((task) => task.open).find((fact) => fact.language !== plan.want);
        const built = await inputOf(readings, { tab: brand<string, 'Text'>(prior.tab), repos: this.deps.repos, now, tasks, facts, writerView });
        const ground = groundOf({ tab: brand<string, 'Text'>(prior.tab), tasks, built, entries: readings.flatMap((r) => r.chunk?.entries ?? []), ledger, now, language: brand<string, 'Text'>(plan.want) });
        return { tasks, ground, request: { input: built.input, language: brand<string, 'Text'>(plan.want), previousLanguage: brand<string, 'Text'>(stale?.language ?? plan.was) } };
    }

    private async preparedOrFail(prior: TabRecap, readings: readonly Reading[], plan: Plan): Promise<Prepared> {
        try { return await this.prepared(prior, readings, plan); } catch (error) {
            const at = this.deps.clock.now();
            this.deps.records.failRun({ tab: prior.tab, at, cause: plan.cause, backend: this.deps.summarizer().backend, costUsd: usd(0), language: plan.was, error: textOf(error instanceof Error ? error.message : String(error)), lanes: readings.map((r) => r.cursor), marks: marksOf(readings, at, NOT_ADVANCED) });
            throw error;
        }
    }

    private async summarize(prior: TabRecap, readings: readonly Reading[], plan: Plan, run: Run): Promise<void> {
        const errors = readings.flatMap((r) => (r.error === null ? [] : [`${r.lane.pane}: ${r.error}`]));
        const note = errors.length > 0 ? textOf(errors.join('; ')) : null;
        const unmoved = readings.map((r) => r.cursor);
        const advanced = readings.map((r) => (r.chunk === null ? r.cursor : { ...r.cursor, ...r.chunk.position }));
        const parts = readings.filter((r) => r.chunk !== null && r.chunk.entries.length > 0);
        const { records, clock } = this.deps;
        if (parts.length === 0 && !plan.switched) {
            records.advance({ tab: prior.tab, at: clock.now(), error: note, lanes: advanced, marks: marksOf(readings, clock.now(), ADVANCED) });
            run.advanced(readings);
            return;
        }
        const summarizer = this.deps.summarizer();
        const began = clock.now();
        run.started(began);
        records.beginRun(prior.tab, summarizer.backend, began);
        const { tasks, request, ground } = await this.preparedOrFail(prior, readings, plan);
        const asked = await this.piped(summarizer, request, ground);
        const facts = { tab: prior.tab, at: clock.now(), cause: plan.cause, backend: summarizer.backend, costUsd: asked.cost };
        const took = `${((facts.at - began) / 1000).toFixed(1)} s (${plan.cause})`;
        if (asked.kind === 'failed') {
            this.deps.log(`recap ${prior.tab}: failed in ${took}`);
            records.failRun({ ...facts, language: plan.was, error: asked.error, lanes: unmoved, marks: marksOf(readings, facts.at, NOT_ADVANCED) });
            return;
        }
        this.deps.log(`recap ${prior.tab}: written in ${took}`);
        this.written({ ...facts, language: plan.want, error: note, lanes: advanced }, { tasks, request, asked, readings, parts });
        run.advanced(readings);
    }

    private written(base: Omit<RecordedRun, 'tasks' | 'changed' | 'refused' | 'marks' | 'input' | 'gateStats'>, run: WrittenRun): void {
        const owner = { tab: base.tab }, marks = marksOf(run.readings, instant(base.at), ADVANCED), before = run.tasks.map((task) => ({ task, facts: this.deps.ledger.allOf({ ...owner, key: task.id }) })), entries = run.parts.flatMap((r) => (r.chunk?.entries ?? []).filter((entry) => entry.role === 'user' && entry.queued !== true).map((entry) => ({ key: r.lane.pane, at: instant(entry.at ?? base.at) })));
        this.deps.records.recordRun({ ...base, tasks: run.tasks, ...foldedRun(throwingLedger(this.deps.ledger), run.asked.tasks, { owner, at: base.at, language: base.language, mint: () => this.deps.mint() }), gateStats: run.asked.stats, marks, ...(this.deps.keepInput?.() ?? true ? { input: writerContext(run.request) } : {}) });
        this.deps.ran?.({ tab: brand<string, 'TabId'>(base.tab), turns: count(entries.length), boundary: brand<boolean, 'Boundary'>(marks.length > 0), cause: textOf(base.cause), entries, established: accomplishedOf(before, run.tasks.map((task) => ({ task, facts: this.deps.ledger.allOf({ ...owner, key: task.id }) })), instant(base.at), (failure) => this.deps.log(`recap ${base.cause}: accomplishments not reported, ${saying(failure.why)}`)) });
    }
}
