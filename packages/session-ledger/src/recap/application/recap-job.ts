import type { Lane, TabId } from '#src/recap/domain/lane-shape.ts';
import type { RecapCause } from '#src/recap/domain/recap-cause.ts';
import type { TranscriptRegistry } from '#src/ports/transcript-registry.ts';
import type { Clock } from '#src/ports/clock.ts';
import type { FactId } from '#src/recap/domain/fact.ts';
import type { LaneRepo } from '#src/ports/lane-repo.ts';
import type { CheckedLedger } from '#src/ports/ledger.ts';
import { blankRecap, hasRecap, type CheckedRecapRecords, type LaneCursor, type RecordedRun, type TabRecap } from '#src/ports/recap-records.ts';
import type { RecapRequest, Summarizer } from '#src/ports/summarizer.ts';
import { UNREAD, type Chunk, type Transcripts } from '#src/ports/transcripts.ts';
import { isUnknown, saying, type Unknown } from '#src/ports/unknowable.ts';
import type { Enumerators } from '#src/ports/enumerators.ts';
import { DEFAULT_PIPELINE, type CloseEvidence, type Pipeline } from '#src/recap/domain/pipeline.ts';
import { DEBOUNCE_OFF, type Debounce } from '#src/recap/domain/debounce.ts';
import { keptGrouping, type PlacedLane, type TaskShape } from '#src/recap/domain/grouping.ts';
import { taskFactsOf } from './ledger-input.ts';
import { groundOf } from './extract-ground.ts';
import type { Extracted, Ground } from './extract-job.ts';
import { extractPiped } from './extract-pipeline.ts';
import type { RunEvent } from './ledger-reconcile.ts';
import { instant } from '#src/recap/domain/time.ts';
import { marksOf } from './boundaries.ts';
import type { WriterView } from '#src/recap/domain/writer-view.ts';
import { inputOf } from './recap-input.ts';
import { writerContext } from './writer-context.ts';
import { foldedRun, throwingLedger } from './run-fold.ts';
import { CursorCarry } from './cursor-carry.ts';

export interface RecapJobDeps {
    readonly transcripts: TranscriptRegistry;
    readonly records: CheckedRecapRecords;
    readonly ledger: CheckedLedger;
    readonly repos: LaneRepo;
    readonly clock: Clock;
    summarizer(): Summarizer;
    language(): string;
    keepInput?(): boolean;
    pipeline?(): Pipeline;
    closeEvidence?(): CloseEvidence;
    writerView(): WriterView;
    debounce?(): Debounce;
    enumerator?(): Enumerators | null;
    ran?(event: RunEvent): void;
    mint(): FactId;
    log(line: string): void;
}

const TURN_SETTLE_MS = 2500;
const READ_BUDGET = 768 * 1024;
async function placeOf(seat: Lane, repos: LaneRepo): Promise<PlacedLane> {
    const found = seat.cwd === null ? null : await repos.repoOf(seat.cwd);
    return { pane: String(seat.pane), place: found?.kind === 'repo' ? found.root : seat.cwd };
}

interface Reading { readonly lane: Lane; readonly cursor: LaneCursor; readonly chunk: Chunk | null; readonly grew: boolean; readonly fresh: boolean; readonly error: string | null }

interface Located { readonly reader: Transcripts; readonly source: string }

type Start = { readonly kind: 'after'; readonly delay: number } | { readonly kind: 'at'; readonly deadline: number };

interface Pending { readonly lanes: readonly Lane[]; readonly cause: RecapCause; readonly forced: boolean; readonly start: Start }

interface Plan { readonly want: string; readonly was: string; readonly switched: boolean; readonly cause: RecapCause; readonly keys: readonly string[] }
interface Prepared { readonly tasks: readonly TaskShape[]; readonly request: RecapRequest; readonly ground: Ground }

interface Slot { timer: ReturnType<typeof setTimeout> | null; running: boolean; pending: Pending | null; lastStart: number | null; lastLanes: ReadonlySet<Lane['pane']>; waiting: (() => void)[] }

const forcedCause = (cause: RecapCause): boolean => cause !== 'turn-ended';

function stronger(previous: Pending | null, next: Pending): Pending {
    return previous !== null && previous.forced && !next.forced ? { ...previous, lanes: next.lanes } : next;
}

function laneSet(lanes: readonly Lane[]): ReadonlySet<Lane['pane']> {
    return new Set(lanes.map((entry) => entry.pane));
}

function sameLanes(left: ReadonlySet<Lane['pane']>, right: ReadonlySet<Lane['pane']>): boolean {
    return left.size === right.size && [...left].every((pane) => right.has(pane));
}

function pendingOf(slot: Slot, lanes: readonly Lane[], cause: RecapCause, debounce: Debounce, clock: () => number): Pending {
    switch (debounce.kind) {
        case 'off':
            return { lanes, cause, forced: forcedCause(cause), start: { kind: 'after', delay: cause === 'turn-ended' ? TURN_SETTLE_MS : 0 } };
        case 'window': {
            const now = clock();
            const lastStart = slot.lastStart;
            const forced = forcedCause(cause) || lastStart === null || !sameLanes(slot.lastLanes, laneSet(lanes));
            const deadline = lastStart === null || forced ? now : Math.max(lastStart + debounce.window, now + TURN_SETTLE_MS);
            return stronger(slot.pending, { lanes, cause, forced, start: { kind: 'at', deadline } });
        }
        default: {
            const exhaustive: never = debounce;
            return exhaustive;
        }
    }
}

function delayOf(start: Start, clock: () => number): number {
    switch (start.kind) {
        case 'after':
            return start.delay;
        case 'at':
            return Math.max(0, start.deadline - clock());
        default: {
            const exhaustive: never = start;
            return exhaustive;
        }
    }
}

export class RecapJob {
    private readonly deps: RecapJobDeps;
    private readonly slots = new Map<string, Slot>();
    private readonly carry = new CursorCarry();

    constructor(deps: RecapJobDeps) { this.deps = deps; }

    request(tab: TabId, lanes: readonly Lane[], cause: RecapCause): void {
        const key = String(tab);
        const slot = this.slots.get(key) ?? { timer: null, running: false, pending: null, lastStart: null, lastLanes: new Set(), waiting: [] };
        this.slots.set(key, slot);
        const debounce = this.deps.debounce?.() ?? DEBOUNCE_OFF;
        slot.pending = pendingOf(slot, lanes, cause, debounce, () => Number(this.deps.clock.now()));
        this.arm(slot, tab);
    }

    private arm(slot: Slot, tab: TabId): void {
        if (slot.running) return;
        if (slot.timer !== null) clearTimeout(slot.timer);
        const pending = slot.pending;
        if (pending === null) return;
        slot.timer = setTimeout(() => {
            slot.pending = null;
            void this.fly(slot, tab, pending);
        }, delayOf(pending.start, () => Number(this.deps.clock.now())));
    }

    private async fly(slot: Slot, tab: TabId, pending: Pending): Promise<void> {
        slot.timer = null;
        slot.running = true;
        const covered = pending.start.kind === 'at' ? slot.waiting.splice(0) : [];
        try {
            await this.recap(tab, pending.lanes, pending.cause, (at) => { slot.lastStart = Number(at); slot.lastLanes = laneSet(pending.lanes); });
        } catch (error) {
            this.deps.log(`recap ${tab}: ${error instanceof Error ? error.message : String(error)}`);
        }
        slot.running = false;
        const done = slot.pending === null ? [...covered, ...slot.waiting.splice(0)] : covered;
        for (const finish of done) finish();
        if (slot.pending !== null) this.arm(slot, tab);
    }

    refreshNow(tab: TabId, lanes: readonly Lane[]): Promise<void> { this.request(tab, lanes, 'requested'); return this.idle(tab); }

    idle(scope: TabId): Promise<void> {
        const slot = this.slots.get(String(scope));
        return slot === undefined || (!slot.running && slot.timer === null) ? Promise.resolve() : new Promise((resolve) => { slot.waiting.push(resolve); });
    }

    private async locate(lane: Lane): Promise<Located | string> {
        const agent = String(lane.agent);
        const reader = this.deps.transcripts.readerFor(agent);
        if (reader === undefined) return this.deps.transcripts.unavailableReason(agent);
        const located = await reader.locate(lane);
        return isUnknown(located) ? saying(located.why) : { reader, source: located.source };
    }

    private async read(lane: Lane, prior: TabRecap, budget: number): Promise<Reading> {
        const blank: LaneCursor = { pane: String(lane.pane), agent: String(lane.agent), transcript: '', cursor: UNREAD.cursor, tail: UNREAD.tail, title: lane.title, lastPrompt: null, claudeRecap: null };
        const found = await this.locate(lane);
        if (typeof found === 'string') return { lane, cursor: blank, chunk: null, grew: false, fresh: false, error: found };
        const was = await this.carry.cursorFor({ session: lane.session, cursors: prior.lanes.filter((c) => c.pane === blank.pane), wanted: { ...blank, transcript: found.source }, reader: found.reader });
        const chunk = await found.reader.read(found.source, { cursor: was.cursor, tail: was.tail }, budget);
        if (isUnknown(chunk)) return { lane, cursor: was, chunk: null, grew: false, fresh: false, error: saying(chunk.why) };
        const cursor: LaneCursor = { ...was, title: chunk.title ?? was.title, lastPrompt: chunk.lastPrompt ?? was.lastPrompt, claudeRecap: chunk.claudeRecap ?? was.claudeRecap };
        return { lane, cursor, chunk, grew: chunk.grew, fresh: was.cursor === UNREAD.cursor, error: null };
    }

    private async readAll(prior: TabRecap, lanes: readonly Lane[], cause: RecapCause): Promise<readonly Reading[]> {
        const budget = Math.floor(READ_BUDGET / Math.max(1, lanes.length));
        try {
            return await Promise.all(lanes.map((each) => this.read(each, prior, budget)));
        } catch (error) {
            const facts = { tab: prior.tab, at: this.deps.clock.now(), cause, backend: this.deps.summarizer().backend, costUsd: 0 };
            this.deps.records.beginRun(facts.tab, facts.backend, facts.at);
            this.deps.records.failRun({ ...facts, language: hasRecap(prior) ? prior.language : this.deps.language(), error: error instanceof Error ? error.message : String(error), lanes: prior.lanes });
            throw error;
        }
    }

    private async recap(tab: TabId, lanes: readonly Lane[], cause: RecapCause, writerStarted: (at: ReturnType<Clock['now']>) => void): Promise<void> {
        const key = String(tab);
        const prior = this.deps.records.readRecap(key) ?? blankRecap(key);
        if ('kind' in prior) return this.skipped(key, prior);
        const keys = this.deps.ledger.keysOf(key);
        if ('kind' in keys) return this.skipped(key, keys);
        const want = this.deps.language();
        const switched = this.switchedOf(prior, keys, want, cause);
        if (typeof switched !== 'boolean') return this.skipped(key, switched);
        const readings = await this.readAll(prior, lanes, cause);
        if (cause === 'focused' && hasRecap(prior) && !switched && !readings.some((r) => r.grew)) return;
        await this.summarize(prior, readings, { want, was: hasRecap(prior) ? prior.language : want, switched, cause, keys }, writerStarted);
    }

    private skipped(tab: string, failure: Unknown): void { this.deps.log(`recap ${tab}: skipped, ${saying(failure.why)}`); }

    private switchedOf(prior: TabRecap, keys: readonly string[], want: string, cause: RecapCause): boolean | Unknown {
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
            return { kind: 'failed', error: text, cost: 0 };
        }
    }

    private async prepared(prior: TabRecap, readings: readonly Reading[], plan: Plan): Promise<Prepared> {
        const now = this.deps.clock.now(); const ledger = throwingLedger(this.deps.ledger);
        const tasks = keptGrouping(prior.tasks, await Promise.all(readings.map((r) => placeOf(r.lane, this.deps.repos))), plan.keys);
        const writerView = this.deps.writerView();
        const facts = tasks.map((task) => taskFactsOf(ledger, { tab: prior.tab, key: task.id }, now));
        const stale = facts.flatMap((task) => task.open).find((fact) => fact.language !== plan.want);
        const built = await inputOf(readings, { tab: prior.tab, repos: this.deps.repos, now, tasks, facts, writerView });
        const ground = groundOf({ tab: prior.tab, tasks, built, entries: readings.flatMap((r) => r.chunk?.entries ?? []), ledger, now, language: plan.want });
        return { tasks, ground, request: { input: built.input, language: plan.want, previousLanguage: stale?.language ?? plan.was } };
    }

    private async preparedOrFail(prior: TabRecap, readings: readonly Reading[], plan: Plan): Promise<Prepared> {
        try { return await this.prepared(prior, readings, plan); } catch (error) {
            const at = this.deps.clock.now();
            this.deps.records.failRun({ tab: prior.tab, at, cause: plan.cause, backend: this.deps.summarizer().backend, costUsd: 0, language: plan.was, error: error instanceof Error ? error.message : String(error), lanes: readings.map((r) => r.cursor), marks: marksOf(readings, at, false) });
            throw error;
        }
    }

    private async summarize(prior: TabRecap, readings: readonly Reading[], plan: Plan, writerStarted: (at: ReturnType<Clock['now']>) => void): Promise<void> {
        const errors = readings.flatMap((r) => (r.error === null ? [] : [`${r.lane.pane}: ${r.error}`]));
        const note = errors.length > 0 ? errors.join('; ') : null;
        const unmoved = readings.map((r) => r.cursor);
        const advanced = readings.map((r) => (r.chunk === null ? r.cursor : { ...r.cursor, ...r.chunk.position }));
        const parts = readings.filter((r) => r.chunk !== null && r.chunk.entries.length > 0);
        const { records, clock } = this.deps;
        if (parts.length === 0 && !plan.switched) return records.advance({ tab: prior.tab, at: clock.now(), error: note, lanes: advanced, marks: marksOf(readings, clock.now(), true) });
        const summarizer = this.deps.summarizer();
        const began = clock.now();
        writerStarted(began);
        records.beginRun(prior.tab, summarizer.backend, began);
        const { tasks, request, ground } = await this.preparedOrFail(prior, readings, plan);
        const asked = await this.piped(summarizer, request, ground);
        const facts = { tab: prior.tab, at: clock.now(), cause: plan.cause, backend: summarizer.backend, costUsd: asked.cost };
        const took = `${((facts.at - began) / 1000).toFixed(1)} s (${plan.cause})`;
        if (asked.kind === 'failed') {
            this.deps.log(`recap ${prior.tab}: failed in ${took}`);
            records.failRun({ ...facts, language: plan.was, error: asked.error, lanes: unmoved, marks: marksOf(readings, facts.at, false) });
            return;
        }
        this.deps.log(`recap ${prior.tab}: written in ${took}`);
        this.written({ ...facts, language: plan.want, error: note, lanes: advanced }, { tasks, request, asked, readings, parts });
    }

    private written(base: Omit<RecordedRun, 'tasks' | 'changed' | 'refused' | 'marks' | 'input' | 'gateStats'>, run: { tasks: readonly TaskShape[]; request: RecapRequest; asked: Extract<Extracted, { kind: 'ops' }>; readings: readonly Reading[]; parts: readonly Reading[] }): void {
        const owner = { tab: base.tab }, marks = marksOf(run.readings, base.at, true), before = run.tasks.flatMap((task) => this.deps.ledger.allOf({ ...owner, key: task.id })), entries = run.parts.flatMap((r) => (r.chunk?.entries ?? []).filter((entry) => entry.role === 'user' && entry.queued !== true).map((entry) => ({ key: r.lane.pane, at: instant(entry.at ?? base.at) })));
        this.deps.records.recordRun({ ...base, tasks: run.tasks, ...foldedRun(throwingLedger(this.deps.ledger), run.asked.tasks, { owner, at: base.at, language: base.language, mint: () => this.deps.mint() }), gateStats: run.asked.stats, marks, ...(this.deps.keepInput?.() ?? true ? { input: writerContext(run.request) } : {}) });
        this.deps.ran?.({ tab: base.tab, turns: entries.length, boundary: marks.length > 0, cause: base.cause, entries, established: run.tasks.flatMap((task) => this.deps.ledger.allOf({ ...owner, key: task.id }).filter((fact) => fact.section === 'done' && !before.some((old) => old.id === fact.id)).map((fact) => ({ task, fact, at: instant(base.at) }))) });
    }
}
