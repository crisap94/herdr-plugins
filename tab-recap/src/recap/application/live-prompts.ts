import type { Lane } from '#src/recap/domain/lane.ts';
import type { Transcripts } from '#src/ports/transcripts.ts';
import { isUnknown } from '#src/ports/unknowable.ts';

/** How much of the end of a transcript is looked through for the newest prompt. */
const TAIL_BYTES = 256 * 1024;
const ANY_KIND = '*';
/** panes that are gone are never told to us; the oldest entries are dropped past this many */
const REMEMBERED = 200;

/**
 * The newest thing the operator typed to each lane, read when the lane's status changes. It reads through the
 * lane's own reader and moves no position: the recap's cursors are the recap job's alone.
 */
export class LivePrompts {
    private readonly transcripts: readonly Transcripts[];
    private readonly known = new Map<string, string>();

    constructor(transcripts: readonly Transcripts[]) {
        this.transcripts = transcripts;
    }

    of(pane: string): string | null {
        return this.known.get(pane) ?? null;
    }

    /** Read the lane's newest prompt; true when it differs from what was known. A lane that cannot be read keeps what it had. */
    async refresh(lane: Lane): Promise<boolean> {
        const agent = String(lane.agent);
        const reader = this.transcripts.find((candidate) => candidate.agent === agent) ?? this.transcripts.find((candidate) => candidate.agent === ANY_KIND);
        if (reader === undefined) {
            return false;
        }
        const located = await reader.locate(lane);
        if (isUnknown(located)) {
            return false;
        }
        const found = await reader.latestPrompt(located.source, TAIL_BYTES);
        const pane = String(lane.pane);
        if (isUnknown(found) || found.text === null || found.text === this.known.get(pane)) {
            return false;
        }
        this.known.delete(pane);
        this.known.set(pane, found.text);
        if (this.known.size > REMEMBERED) {
            this.known.delete(this.known.keys().next().value ?? '');
        }
        return true;
    }
}
