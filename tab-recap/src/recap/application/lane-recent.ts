import type { Lane } from '#src/recap/domain/lane.ts';
import { sessionId } from '#src/recap/domain/ids.ts';
import { UNREAD } from '#src/ports/transcripts.ts';
import type { Entry, Mark, Transcripts } from '#src/ports/transcripts.ts';
import { isUnknown } from '#src/ports/unknowable.ts';
import type { Unknown } from '#src/ports/unknowable.ts';

/** How much of the end of a transcript is looked through for the agent's last turns. */
const TAIL_BYTES = 256 * 1024;
const ANY_KIND = '*';

/** herdr's session of a pane now (its `agent_session`, as an id); null when it has none, and unknown when herdr cannot say. */
export type CurrentSession = (pane: string) => Promise<string | null | Unknown>;

/**
 * The agent's last turns and compactions, read through the lane's own reader; it moves no position: the recap's cursors are the recap job's alone.
 * The transcript read is the session herdr reports for the pane now: a lane's session is what it held when it was detected, and an agent that is new
 * or was resumed has another one. Only when herdr cannot say does the lane's own session serve.
 */
export class LaneRecent {
    private readonly transcripts: readonly Transcripts[];
    private readonly session: CurrentSession;

    constructor(transcripts: readonly Transcripts[], session: CurrentSession) {
        this.transcripts = transcripts;
        this.session = session;
    }

    /** The lane with herdr's session for its pane, when herdr has one. */
    private async now(lane: Lane): Promise<Lane> {
        const current = await this.session(String(lane.pane));
        return typeof current === 'string' ? { ...lane, session: sessionId(current) } : lane;
    }

    private async tail(lane: Lane): Promise<{ readonly entries: readonly Entry[]; readonly marks: readonly Mark[] }> {
        const agent = String(lane.agent);
        const reader = this.transcripts.find((candidate) => candidate.agent === agent) ?? this.transcripts.find((candidate) => candidate.agent === ANY_KIND);
        const current = await this.now(lane);
        const located = reader === undefined ? null : await reader.locate(current);
        if (reader === undefined || located === null || isUnknown(located)) {
            return { entries: [], marks: [] };
        }
        const chunk = await reader.read(located.source, UNREAD, TAIL_BYTES);
        return isUnknown(chunk) ? { entries: [], marks: [] } : { entries: chunk.entries, marks: chunk.marks ?? [] };
    }

    async of(lane: Lane): Promise<readonly Entry[]> {
        return (await this.tail(lane)).entries;
    }

    /** The compactions the agent's own records show in their tail, in the session herdr reports for the pane now. */
    async marks(lane: Lane): Promise<readonly Mark[]> {
        return (await this.tail(lane)).marks;
    }
}
