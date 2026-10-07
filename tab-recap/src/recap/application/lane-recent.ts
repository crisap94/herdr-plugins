import type { Lane } from '#src/recap/domain/lane.ts';
import { UNREAD } from '#src/ports/transcripts.ts';
import type { Entry, Mark, Transcripts } from '#src/ports/transcripts.ts';
import { isUnknown } from '#src/ports/unknowable.ts';

/** How much of the end of a transcript is looked through for the agent's last turns. */
const TAIL_BYTES = 256 * 1024;
const ANY_KIND = '*';

/** The agent's last turns and compactions, read through the lane's own reader; it moves no position: the recap's cursors are the recap job's alone. */
export class LaneRecent {
    private readonly transcripts: readonly Transcripts[];

    constructor(transcripts: readonly Transcripts[]) {
        this.transcripts = transcripts;
    }

    private async tail(lane: Lane): Promise<{ readonly entries: readonly Entry[]; readonly marks: readonly Mark[] }> {
        const agent = String(lane.agent);
        const reader = this.transcripts.find((candidate) => candidate.agent === agent) ?? this.transcripts.find((candidate) => candidate.agent === ANY_KIND);
        const located = reader === undefined ? null : await reader.locate(lane);
        if (reader === undefined || located === null || isUnknown(located)) {
            return { entries: [], marks: [] };
        }
        const chunk = await reader.read(located.source, UNREAD, TAIL_BYTES);
        return isUnknown(chunk) ? { entries: [], marks: [] } : { entries: chunk.entries, marks: chunk.marks ?? [] };
    }

    async of(lane: Lane): Promise<readonly Entry[]> {
        return (await this.tail(lane)).entries;
    }

    /** The compactions the agent's own records show in their tail. */
    async marks(lane: Lane): Promise<readonly Mark[]> {
        return (await this.tail(lane)).marks;
    }
}
