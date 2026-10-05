import type { TabId } from '#src/recap/domain/ids.ts';
import type { RecapCause } from '#src/recap/domain/intent.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import { ANY_KIND } from '#src/recap/domain/policy.ts';
import type { RecapSections } from '#src/recap/domain/shape.ts';
import type { Clock } from '#src/ports/clock.ts';
import { blankRecap } from '#src/ports/recap-store.ts';
import type { LaneCursor, RecapStore, TabRecap } from '#src/ports/recap-store.ts';
import type { RecapRequest, Summarizer } from '#src/ports/summarizer.ts';
import { UNREAD } from '#src/ports/transcripts.ts';
import type { Chunk, Transcripts } from '#src/ports/transcripts.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import { isScreenSource } from '#src/ports/screens.ts';
import { renderExcerpt } from './excerpt.ts';
import { parseRecap, renderRecap } from './recap-shape.ts';

export interface RecapJobDeps {
    readonly transcripts: readonly Transcripts[];
    readonly store: RecapStore;
    readonly clock: Clock;
    summarizer(): Summarizer;
    /** what recaps should be written in right now (re-read for every recap) */
    language(): string;
    log(line: string): void;
}

/** A turn's status can flap working↔idle; wait this long before reading the transcripts. */
const TURN_SETTLE_MS = 2500;
/** At most this much is read per recap, shared by the tab's lanes. */
const READ_BUDGET = 768 * 1024;
const EXCERPT_BUDGET = 60_000;
/** The writer gets two tries at answering in the fixed shape. */
const ATTEMPTS = 2;

type Asked = { readonly kind: 'sections'; readonly sections: RecapSections; readonly cost: number } | { readonly kind: 'failed'; readonly error: string; readonly cost: number };

/** What one lane contributes to its tab's recap this time. */
interface Reading {
    readonly lane: Lane;
    readonly cursor: LaneCursor;
    readonly chunk: Chunk | null;
    readonly grew: boolean;
    readonly error: string | null;
}

interface Slot {
    timer: ReturnType<typeof setTimeout> | null;
    running: boolean;
    again: { lanes: readonly Lane[]; cause: RecapCause } | null;
}

export function laneLabel(lane: Lane, title: string | null, screen = false): string {
    return `${lane.agent} in ${lane.pane}${screen ? ' (screen)' : ''}${title === null ? '' : ` — ${title}`}`;
}

/** A lane read from its screen says so, to the writer and in the column. */
const fromScreen = (cursor: LaneCursor): boolean => isScreenSource(cursor.transcript);

/** Single flight per TAB: one recap at a time, and at most one more queued behind it. */
export class RecapJob {
    private readonly deps: RecapJobDeps;
    private readonly slots = new Map<string, Slot>();

    constructor(deps: RecapJobDeps) {
        this.deps = deps;
    }

    request(tab: TabId, lanes: readonly Lane[], cause: RecapCause): void {
        const key = String(tab);
        const slot = this.slots.get(key) ?? { timer: null, running: false, again: null };
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
        }
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
            return { lane, cursor: blank, chunk: null, grew: false, error: found };
        }
        const { reader, source } = found;
        const was = prior.lanes.find((c) => c.pane === String(lane.pane) && c.transcript === source) ?? { ...blank, transcript: source };
        const chunk = await reader.read(source, { cursor: was.cursor, tail: was.tail }, budget);
        if (isUnknown(chunk)) {
            return { lane, cursor: was, chunk: null, grew: false, error: saying(chunk.why) };
        }
        const cursor: LaneCursor = {
            ...was,
            title: chunk.title ?? was.title,
            lastPrompt: chunk.lastPrompt ?? was.lastPrompt,
            claudeRecap: chunk.claudeRecap ?? was.claudeRecap,
        };
        return { lane, cursor, chunk, grew: chunk.grew, error: null };
    }

    private async recap(tab: TabId, lanes: readonly Lane[], cause: RecapCause): Promise<void> {
        const prior = this.deps.store.readRecap(String(tab)) ?? blankRecap(String(tab));
        const budget = Math.floor(READ_BUDGET / Math.max(1, lanes.length));
        const readings = await Promise.all(lanes.map((lane) => this.read(lane, prior, budget)));
        const want = this.deps.language();
        const switched = prior.markdown !== '' && prior.language !== want;
        if (cause === 'focused' && prior.markdown !== '' && !switched && !readings.some((r) => r.grew)) {
            return;
        }
        await this.summarize(prior, readings, { want, switched });
    }

    /** `switched`: the recap exists in another language than wanted — rewrite it now, new excerpt or not. */
    private async summarize(prior: TabRecap, readings: readonly Reading[], language: { want: string; switched: boolean }): Promise<void> {
        const errors = readings.flatMap((r) => (r.error === null ? [] : [`${r.lane.pane}: ${r.error}`]));
        const noted: TabRecap = { ...prior, language: prior.markdown === '' ? language.want : prior.language, lanes: readings.map((r) => r.cursor), error: errors.length > 0 ? errors.join('; ') : null };
        const advanced: TabRecap = { ...noted, lanes: readings.map((r) => (r.chunk === null ? r.cursor : { ...r.cursor, ...r.chunk.position })) };
        const parts = readings.filter((r) => r.chunk !== null && r.chunk.entries.length > 0);
        if (parts.length === 0 && !language.switched) {
            this.deps.store.writeRecap(advanced);
            return;
        }
        const share = Math.floor(EXCERPT_BUDGET / Math.max(1, parts.length));
        const excerpt = parts.map((r) => `=== ${laneLabel(r.lane, r.cursor.title, fromScreen(r.cursor))} ===\n${renderExcerpt(r.chunk?.entries ?? [], share)}`).join('\n\n');
        const summarizer = this.deps.summarizer();
        this.deps.store.writeRecap({ ...noted, running: true, backend: summarizer.backend });
        const asked = await this.ask(summarizer, {
            previous: prior.sections === null ? prior.markdown : JSON.stringify(prior.sections), excerpt,
            language: language.want, previousLanguage: noted.language,
            lanes: readings.map((r) => laneLabel(r.lane, r.cursor.title, fromScreen(r.cursor))),
        });
        if (asked.kind === 'failed') {
            this.deps.store.writeRecap({ ...noted, running: false, error: asked.error, backend: summarizer.backend, costUsd: prior.costUsd + asked.cost });
            return;
        }
        this.deps.store.writeRecap({
            ...advanced, language: language.want, sections: asked.sections, markdown: renderRecap(asked.sections, language.want === 'es' ? 'es' : 'en'),
            at: this.deps.clock.now(), running: false, backend: summarizer.backend, costUsd: prior.costUsd + asked.cost,
        });
    }

    /**
     * The writer's answer must be the seven sections as JSON. One retry, saying what was wrong; if it is
     * still unusable the previous recap stays (with an error line) and the cursors do not advance.
     */
    private async ask(summarizer: Summarizer, request: RecapRequest): Promise<Asked> {
        let cost = 0;
        let correction: string | undefined;
        for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
            const written = await summarizer.write(correction === undefined ? request : { ...request, correction });
            if (isUnknown(written)) {
                return { kind: 'failed', error: saying(written.why), cost };
            }
            cost += written.costUsd;
            const parsed = parseRecap(written.text);
            if (parsed.kind === 'sections') {
                return { kind: 'sections', sections: parsed.sections, cost };
            }
            correction = parsed.why;
        }
        return { kind: 'failed', error: `the writer's answer was not usable (${correction ?? 'unknown'}); the previous recap is kept`, cost };
    }
}
