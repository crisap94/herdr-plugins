import { contextOf } from '#src/recap/domain/compaction.ts';
import type { ContextUse } from '#src/recap/domain/compaction.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import type { ModelCatalogue } from '#src/ports/model-catalogue.ts';
import type { ObservedResult, Transcripts } from '#src/ports/transcripts.ts';
import { isUnknown } from '#src/ports/unknowable.ts';

/** The end of a transcript looked through for the newest token count (a count sits near the end). */
const TAIL_BYTES = 256 * 1024;
const ANY_KIND = '*';
/** panes that are gone are never told to us; the oldest entries are dropped past this many */
const REMEMBERED = 200;

const keyOf = (use: ContextUse | null | undefined): string => (use === null || use === undefined ? '' : `${use.tokens} ${use.window} ${use.source}`);

/**
 * How full each lane's context is, read when the lane's status changes, through the lane's own reader (moving no position).
 * The window is found at runtime (see `contextOf`); `setting` is the operator's override, read on every look.
 */
export class LaneContexts {
    private readonly transcripts: readonly Transcripts[];
    private readonly catalogue: ModelCatalogue;
    private readonly setting: () => number | null;
    private readonly known = new Map<string, ContextUse | null>();

    constructor(transcripts: readonly Transcripts[], catalogue: ModelCatalogue, setting: () => number | null) {
        this.transcripts = transcripts;
        this.catalogue = catalogue;
        this.setting = setting;
    }

    of(pane: string): ContextUse | null {
        return this.known.get(pane) ?? null;
    }

    /** What the lane's own records say, or null when they cannot be read. */
    private async observedIn(lane: Lane): Promise<ObservedResult | null> {
        const agent = String(lane.agent);
        const reader = this.transcripts.find((candidate) => candidate.agent === agent) ?? this.transcripts.find((candidate) => candidate.agent === ANY_KIND);
        const located = reader === undefined ? null : await reader.locate(lane);
        return reader?.observed === undefined || located === null || isUnknown(located) ? null : reader.observed(located.source, TAIL_BYTES);
    }

    /** What the lane's agent says now: its use, null when it says nothing yet, undefined when it cannot be read. */
    private async read(lane: Lane): Promise<ContextUse | null | undefined> {
        const found = await this.observedIn(lane);
        if (found === null || isUnknown(found)) {
            return undefined;
        }
        const { observed } = found;
        return observed === null ? null : contextOf({ observed, agent: String(lane.agent), setting: this.setting(), catalogued: observed.model === null ? null : this.catalogue.windowOf(observed.model) });
    }

    /** Look again; true when the answer differs from what was known. A lane that cannot be read keeps what it had. */
    async refresh(lane: Lane): Promise<boolean> {
        const use = await this.read(lane);
        const pane = String(lane.pane);
        if (use === undefined || keyOf(use) === keyOf(this.known.get(pane))) {
            return false;
        }
        this.known.delete(pane);
        this.known.set(pane, use);
        if (this.known.size > REMEMBERED) {
            this.known.delete(this.known.keys().next().value ?? '');
        }
        return true;
    }
}
