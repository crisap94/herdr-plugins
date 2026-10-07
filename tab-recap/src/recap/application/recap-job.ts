import type { TabId } from '#src/recap/domain/ids.ts';
import type { RecapCause } from '#src/recap/domain/intent.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import { ANY_KIND } from '#src/recap/domain/policy.ts';
import type { Clock } from '#src/ports/clock.ts';
import type { LaneRepo } from '#src/ports/lane-repo.ts';
import { blankRecap, hasRecap } from '#src/ports/recap-records.ts';
import type { LaneCursor, RecapRecords, TabRecap } from '#src/ports/recap-records.ts';
import type { RecapRequest, Summarizer } from '#src/ports/summarizer.ts';
import { UNREAD } from '#src/ports/transcripts.ts';
import type { Chunk, Transcripts } from '#src/ports/transcripts.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import { ask } from './recap-ask.ts';
import { inputOf } from './recap-input.ts';
import { writerContext } from './writer-context.ts';

export interface RecapJobDeps {
    readonly transcripts: readonly Transcripts[];
    readonly records: RecapRecords;
    /** where a lane's cwd lives in git: a hint for grouping the lanes into tasks */
    readonly repos: LaneRepo;
    readonly clock: Clock;
    summarizer(): Summarizer;
    /** what recaps should be written in right now (re-read for every recap) */
    language(): string;
    /** whether each run's input document is kept for judging (`TAB_RECAP_KEEP_INPUT_DAYS` above 0); kept when not given */
    keepInput?(): boolean;
    log(line: string): void;
}

/** A turn's status can flap working↔idle; wait this long before reading the transcripts. */
const TURN_SETTLE_MS = 2500;
/** At most this much is read per recap, shared by the tab's lanes. */
const READ_BUDGET = 768 * 1024;
/** What one lane contributes to its tab's recap this time. */
interface Reading {
    readonly lane: Lane;
    readonly cursor: LaneCursor;
    readonly chunk: Chunk | null;
    readonly grew: boolean;
    /** the lane's transcript was never read before */
    readonly fresh: boolean;
    readonly error: string | null;
}

interface Slot {
    timer: ReturnType<typeof setTimeout> | null;
    running: boolean;
    again: { lanes: readonly Lane[]; cause: RecapCause } | null;
    /** callers waiting for the tab's recap to settle */
    waiting: (() => void)[];
}

/** Single flight per TAB: one recap at a time, and at most one more queued behind it. */
export class RecapJob {
    private readonly deps: RecapJobDeps;
    private readonly slots = new Map<string, Slot>();

    constructor(deps: RecapJobDeps) {
        this.deps = deps;
    }

    request(tab: TabId, lanes: readonly Lane[], cause: RecapCause): void {
        const key = String(tab);
        const slot = this.slots.get(key) ?? { timer: null, running: false, again: null, waiting: [] };
        this.slots.set(key, slot);
        if (slot.running) {
            slot.again = { lanes, cause };
            return;
        }
        if (slot.timer !== null) {
            clearTimeout(slot.timer);
        }
        slot.timer = setTimeout(() => { void this.fly(slot, tab, lanes, cause); }, cause === 'turn-ended' ? TURN_SETTLE_MS : 0);
    }

    private async fly(slot: Slot, tab: TabId, lanes: readonly Lane[], cause: RecapCause): Promise<void> {
        slot.timer = null;
        slot.running = true;
        try {
            await this.recap(tab, lanes, cause);
        } catch (error) {
            this.deps.log(`recap ${tab}: ${error instanceof Error ? error.message : String(error)}`);
        }
        slot.running = false;
        const again = slot.again;
        slot.again = null;
        if (again !== null) {
            this.request(tab, again.lanes, again.cause);
            return;
        }
        for (const done of slot.waiting.splice(0)) {
            done();
        }
    }

    /** A recap asked for now, and awaited: resolves when the tab's recap has been written (or has failed) and nothing more is queued behind it. */
    refreshNow(tab: TabId, lanes: readonly Lane[]): Promise<void> {
        return new Promise((resolve) => {
            this.request(tab, lanes, 'requested');
            this.slots.get(String(tab))?.waiting.push(resolve);
        });
    }

    private async locate(lane: Lane): Promise<{ reader: Transcripts; source: string } | string> {
        const agent = String(lane.agent);
        const reader = this.deps.transcripts.find((t) => t.agent === agent) ?? this.deps.transcripts.find((t) => t.agent === ANY_KIND);
        if (reader === undefined) {
            return `no reader for ${agent}`;
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

    private async recap(tab: TabId, lanes: readonly Lane[], cause: RecapCause): Promise<void> {
        const prior = this.deps.records.readRecap(String(tab)) ?? blankRecap(String(tab));
        const budget = Math.floor(READ_BUDGET / Math.max(1, lanes.length));
        const readings = await Promise.all(lanes.map((lane) => this.read(lane, prior, budget)));
        const want = this.deps.language();
        const switched = hasRecap(prior) && prior.language !== want;
        if (cause === 'focused' && hasRecap(prior) && !switched && !readings.some((r) => r.grew)) {
            return;
        }
        await this.summarize(prior, readings, { want, switched, cause });
    }

    private async requestOf(prior: TabRecap, readings: readonly Reading[], language: { want: string; was: string }): Promise<RecapRequest> {
        const input = await inputOf(prior, readings, { repos: this.deps.repos, now: this.deps.clock.now() });
        return { input, language: language.want, previousLanguage: language.was };
    }

    /** `switched`: the recap exists in another language than wanted — rewrite it now, new excerpt or not. */
    private async summarize(prior: TabRecap, readings: readonly Reading[], language: { want: string; switched: boolean; cause: RecapCause }): Promise<void> {
        const errors = readings.flatMap((r) => (r.error === null ? [] : [`${r.lane.pane}: ${r.error}`]));
        const note = errors.length > 0 ? errors.join('; ') : null;
        const was = hasRecap(prior) ? prior.language : language.want;
        const unmoved = readings.map((r) => r.cursor);
        const advanced = readings.map((r) => (r.chunk === null ? r.cursor : { ...r.cursor, ...r.chunk.position }));
        const parts = readings.filter((r) => r.chunk !== null && r.chunk.entries.length > 0);
        const { records, clock } = this.deps;
        if (parts.length === 0 && !language.switched) {
            records.advance({ tab: prior.tab, at: clock.now(), error: note, lanes: advanced });
            return;
        }
        const summarizer = this.deps.summarizer();
        records.beginRun(prior.tab, summarizer.backend, clock.now());
        const panes = readings.map((r) => String(r.lane.pane));
        const request = await this.requestOf(prior, readings, { want: language.want, was });
        const asked = await ask(summarizer, request, prior, panes, language.want === 'es' ? 'es' : 'en');
        const facts = { tab: prior.tab, at: this.deps.clock.now(), cause: language.cause, backend: summarizer.backend, costUsd: asked.cost };
        if (asked.kind === 'failed') {
            records.failRun({ ...facts, language: was, error: asked.error, lanes: unmoved });
            return;
        }
        const input = this.deps.keepInput?.() ?? true ? { input: writerContext(request) } : {};
        records.recordRun({ ...facts, language: language.want, error: note, lanes: advanced, tasks: asked.tasks, gateStats: asked.stats, ...input });
    }
}
