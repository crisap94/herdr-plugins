import type { TabId } from '#src/recap/domain/ids.ts';
import type { RecapCause } from '#src/recap/domain/intent.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import type { TranscriptRegistry } from '#src/ports/transcript-registry.ts';
import type { Clock } from '#src/ports/clock.ts';
import type { LaneRepo } from '#src/ports/lane-repo.ts';
import type { Ledger } from '#src/ports/ledger.ts';
import { blankRecap, hasRecap, type LaneCursor, type RecapRecords, type RecordedRun, type TabRecap } from '#src/ports/recap-records.ts';
import type { RecapRequest, Summarizer } from '#src/ports/summarizer.ts';
import { UNREAD, type Chunk, type Transcripts } from '#src/ports/transcripts.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import type { Enumerators } from '#src/ports/enumerators.ts';
import { DEFAULT_PIPELINE, type Pipeline } from '#src/recap/domain/pipeline.ts';
import { DEBOUNCE_OFF } from '#src/recap/domain/debounce.ts';
import type { Debounce } from '#src/recap/domain/debounce.ts';
import { keptGrouping, type PlacedLane, type TaskShape } from '#src/recap/domain/grouping.ts';
import { CLOSED_SHOWN_MS, type TaskFacts } from './ledger-input.ts';
import { groundOf } from './extract-ground.ts';
import type { Extracted, Ground } from './extract-job.ts';
import { extractPiped } from './extract-pipeline.ts';
import type { RunEvent } from './ledger-reconcile.ts';
import { marksOf } from './boundaries.ts';
import type { WriterView } from '#src/recap/domain/writer-view.ts';
import { inputOf } from './recap-input.ts';
import { writerContext } from './writer-context.ts';

export interface RecapJobDeps {
    readonly transcripts: TranscriptRegistry;
    readonly records: RecapRecords;
    readonly ledger: Ledger;
    readonly repos: LaneRepo;
    readonly clock: Clock;
    summarizer(): Summarizer;
    language(): string;
    keepInput?(): boolean;
    pipeline?(): Pipeline;
    writerView(): WriterView;
    debounce?(): Debounce;
    enumerator?(): Enumerators | null;
    ran?(event: RunEvent): void;
    log(line: string): void;
}

const TURN_SETTLE_MS = 2500;
const READ_BUDGET = 768 * 1024;
async function placeOf(lane: Lane, repos: LaneRepo): Promise<PlacedLane> {
    const found = lane.cwd === null ? null : await repos.repoOf(lane.cwd);
    return { pane: String(lane.pane), place: found?.kind === 'repo' ? found.root : lane.cwd };
}

interface Reading {
    readonly lane: Lane;
    readonly cursor: LaneCursor;
    readonly chunk: Chunk | null;
    readonly grew: boolean;
    readonly fresh: boolean;
    readonly error: string | null;
}

type Start = { readonly kind: 'after'; readonly delay: number } | { readonly kind: 'at'; readonly deadline: number };

interface Pending {
    readonly lanes: readonly Lane[];
    readonly cause: RecapCause;
    readonly forced: boolean;
    readonly start: Start;
}

interface Slot {
    timer: ReturnType<typeof setTimeout> | null;
    running: boolean;
    pending: Pending | null;
    lastStart: number | null;
    lastLanes: ReadonlySet<Lane['pane']>;
    waiting: (() => void)[];
}

const forcedCause = (cause: RecapCause): boolean => cause !== 'turn-ended';

function stronger(previous: Pending | null, next: Pending): Pending {
    return previous !== null && previous.forced && !next.forced ? { ...previous, lanes: next.lanes } : next;
}

function laneSet(lanes: readonly Lane[]): ReadonlySet<Lane['pane']> {
    return new Set(lanes.map((lane) => lane.pane));
}

function sameLanes(left: ReadonlySet<Lane['pane']>, right: ReadonlySet<Lane['pane']>): boolean {
    return left.size === right.size && [...left].every((pane) => right.has(pane));
}

function pendingOf(slot: Slot, lanes: readonly Lane[], cause: RecapCause, debounce: Debounce, clock: () => number): Pending {
    if (debounce.kind === 'off') {
        return { lanes, cause, forced: forcedCause(cause), start: { kind: 'after', delay: cause === 'turn-ended' ? TURN_SETTLE_MS : 0 } };
    }
    const now = clock();
    const lastStart = slot.lastStart;
    const forced = forcedCause(cause) || lastStart === null || !sameLanes(slot.lastLanes, laneSet(lanes));
    if (lastStart === null || forced) {
        return { lanes, cause, forced, start: { kind: 'at', deadline: now } };
    }
    return { lanes, cause, forced, start: { kind: 'at', deadline: Math.max(lastStart + debounce.window, now + TURN_SETTLE_MS) } };
}

function delayOf(start: Start, clock: () => number): number {
    return start.kind === 'after' ? start.delay : Math.max(0, start.deadline - clock());
}

export class RecapJob {
    private readonly deps: RecapJobDeps;
    private readonly slots = new Map<string, Slot>();

    constructor(deps: RecapJobDeps) {
        this.deps = deps;
    }

    request(tab: TabId, lanes: readonly Lane[], cause: RecapCause): void {
        const key = String(tab);
        const slot = this.slots.get(key) ?? { timer: null, running: false, pending: null, lastStart: null, lastLanes: new Set(), waiting: [] };
        this.slots.set(key, slot);
        const debounce = this.deps.debounce?.() ?? DEBOUNCE_OFF;
        const requested = pendingOf(slot, lanes, cause, debounce, () => Number(this.deps.clock.now()));
        slot.pending = debounce.kind === 'off' ? requested : stronger(slot.pending, requested);
        this.arm(slot, tab);
    }

    private arm(slot: Slot, tab: TabId): void {
        if (slot.running) return;
        if (slot.timer !== null) clearTimeout(slot.timer);
        const pending = slot.pending;
        if (pending === null) return;
        slot.timer = setTimeout(() => {
            slot.pending = null;
            void this.fly(slot, tab, pending.lanes, pending.cause);
        }, delayOf(pending.start, () => Number(this.deps.clock.now())));
    }

    private async fly(slot: Slot, tab: TabId, lanes: readonly Lane[], cause: RecapCause): Promise<void> {
        slot.timer = null;
        slot.running = true;
        try {
            await this.recap(tab, lanes, cause, (at) => { slot.lastStart = Number(at); slot.lastLanes = laneSet(lanes); });
        } catch (error) {
            this.deps.log(`recap ${tab}: ${error instanceof Error ? error.message : String(error)}`);
        }
        slot.running = false;
        if (slot.pending !== null) {
            this.arm(slot, tab);
            return;
        }
        for (const done of slot.waiting.splice(0)) {
            done();
        }
    }

    refreshNow(tab: TabId, lanes: readonly Lane[]): Promise<void> {
        return new Promise((resolve) => {
            this.request(tab, lanes, 'requested');
            this.slots.get(String(tab))?.waiting.push(resolve);
        });
    }

    private async locate(lane: Lane): Promise<{ reader: Transcripts; source: string } | string> {
        const agent = String(lane.agent);
        const reader = this.deps.transcripts.readerFor(agent);
        if (reader === undefined) {
            return this.deps.transcripts.unavailableReason(agent);
        }
        const located = await reader.locate(lane);
        return isUnknown(located) ? saying(located.why) : { reader, source: located.source };
    }

    private async read(lane: Lane, prior: TabRecap, budget: number): Promise<Reading> {
        const blank: LaneCursor = { pane: String(lane.pane), agent: String(lane.agent), transcript: '', cursor: UNREAD.cursor, tail: UNREAD.tail, title: lane.title, lastPrompt: null, claudeRecap: null };
        const found = await this.locate(lane);
        if (typeof found === 'string') {
            return { lane, cursor: blank, chunk: null, grew: false, fresh: false, error: found };
        }
        const { reader, source } = found;
        const was = prior.lanes.find((c) => c.pane === String(lane.pane) && c.transcript === source) ?? { ...blank, transcript: source };
        const chunk = await reader.read(source, { cursor: was.cursor, tail: was.tail }, budget);
        if (isUnknown(chunk)) {
            return { lane, cursor: was, chunk: null, grew: false, fresh: false, error: saying(chunk.why) };
        }
        const cursor: LaneCursor = {
            ...was,
            title: chunk.title ?? was.title,
            lastPrompt: chunk.lastPrompt ?? was.lastPrompt,
            claudeRecap: chunk.claudeRecap ?? was.claudeRecap,
        };
        return { lane, cursor, chunk, grew: chunk.grew, fresh: was.cursor === UNREAD.cursor, error: null };
    }

    private async recap(tab: TabId, lanes: readonly Lane[], cause: RecapCause, writerStarted: (at: ReturnType<Clock['now']>) => void): Promise<void> {
        const prior = this.deps.records.readRecap(String(tab)) ?? blankRecap(String(tab));
        const budget = Math.floor(READ_BUDGET / Math.max(1, lanes.length));
        const readings = await Promise.all(lanes.map((lane) => this.read(lane, prior, budget)));
        const want = this.deps.language();
        const switched = hasRecap(prior) && prior.language !== want;
        if (cause === 'focused' && hasRecap(prior) && !switched && !readings.some((r) => r.grew)) {
            return;
        }
        await this.summarize(prior, readings, { want, switched, cause }, writerStarted);
    }

    private factsOf(tab: string, tasks: readonly TaskShape[], now: number): readonly TaskFacts[] {
        const { ledger } = this.deps;
        return tasks.map((task) => ({ key: task.id, open: ledger.openOf({ tab, key: task.id }), closed: ledger.recentlyClosed({ tab, key: task.id }, now - CLOSED_SHOWN_MS) }));
    }

    private piped(summarizer: Summarizer, request: RecapRequest, ground: Ground): Promise<Extracted> {
        const { deps } = this;
        return extractPiped(summarizer, request, ground, { pipeline: deps.pipeline?.() ?? DEFAULT_PIPELINE, enumerator: deps.enumerator?.() ?? null, log: (line) => { deps.log(line); } });
    }

    private async prepared(prior: TabRecap, readings: readonly Reading[], language: { want: string; was: string }): Promise<{ tasks: readonly TaskShape[]; request: RecapRequest; ground: Ground }> {
        const now = this.deps.clock.now();
        const tasks = keptGrouping(prior.tasks, await Promise.all(readings.map((r) => placeOf(r.lane, this.deps.repos))), this.deps.ledger.keysOf(prior.tab));
        const writerView = this.deps.writerView();
        const built = await inputOf(readings, { tab: prior.tab, repos: this.deps.repos, now, tasks, facts: this.factsOf(prior.tab, tasks, now), writerView });
        const ground = groundOf({ tab: prior.tab, tasks, built, entries: readings.flatMap((r) => r.chunk?.entries ?? []), ledger: this.deps.ledger, now, language: language.want });
        return { tasks, ground, request: { input: built.input, language: language.want, previousLanguage: language.was } };
    }

    private async summarize(prior: TabRecap, readings: readonly Reading[], language: { want: string; switched: boolean; cause: RecapCause }, writerStarted: (at: ReturnType<Clock['now']>) => void): Promise<void> {
        const errors = readings.flatMap((r) => (r.error === null ? [] : [`${r.lane.pane}: ${r.error}`]));
        const note = errors.length > 0 ? errors.join('; ') : null;
        const was = hasRecap(prior) ? prior.language : language.want;
        const unmoved = readings.map((r) => r.cursor);
        const advanced = readings.map((r) => (r.chunk === null ? r.cursor : { ...r.cursor, ...r.chunk.position }));
        const parts = readings.filter((r) => r.chunk !== null && r.chunk.entries.length > 0);
        const { records, clock } = this.deps;
        if (parts.length === 0 && !language.switched) {
            records.advance({ tab: prior.tab, at: clock.now(), error: note, lanes: advanced, marks: marksOf(readings, clock.now(), true) });
            return;
        }
        const summarizer = this.deps.summarizer();
        const began = clock.now();
        writerStarted(began);
        records.beginRun(prior.tab, summarizer.backend, began);
        const { tasks, request, ground } = await this.prepared(prior, readings, { want: language.want, was });
        const asked = await this.piped(summarizer, request, ground);
        const facts = { tab: prior.tab, at: this.deps.clock.now(), cause: language.cause, backend: summarizer.backend, costUsd: asked.cost };
        const took = `${((facts.at - began) / 1000).toFixed(1)} s (${language.cause})`;
        if (asked.kind === 'failed') {
            this.deps.log(`recap ${prior.tab}: failed in ${took}`);
            records.failRun({ ...facts, language: was, error: asked.error, lanes: unmoved, marks: marksOf(readings, facts.at, false) });
            return;
        }
        this.deps.log(`recap ${prior.tab}: written in ${took}`);
        this.written({ ...facts, language: language.want, error: note, lanes: advanced }, { tasks, request, asked, readings, parts });
    }

    private written(base: Omit<RecordedRun, 'tasks' | 'ops' | 'marks' | 'input' | 'gateStats'>, run: { tasks: readonly TaskShape[]; request: RecapRequest; asked: Extract<Extracted, { kind: 'ops' }>; readings: readonly Reading[]; parts: readonly Reading[] }): void {
        const input = this.deps.keepInput?.() ?? true ? { input: writerContext(run.request) } : {};
        const marks = marksOf(run.readings, base.at, true);
        this.deps.records.recordRun({ ...base, tasks: run.tasks, ops: run.asked.tasks, gateStats: run.asked.stats, marks, ...input });
        this.deps.ran?.({ tab: base.tab, turns: run.parts.flatMap((r) => r.chunk?.entries ?? []).filter((entry) => entry.role === 'user' && entry.queued !== true).length, boundary: marks.length > 0, cause: base.cause });
    }
}
