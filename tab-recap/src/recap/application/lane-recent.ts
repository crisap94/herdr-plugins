import { must } from '#src/protocol/result.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import { type PaneId, type SessionId, parseSessionId } from '#src/recap/domain/ids.ts';
import { UNREAD, type Entry, type Mark } from '#src/ports/transcripts.ts';
import { isUnknown, type Unknown } from '#src/ports/unknowable.ts';
import type { TranscriptRegistry } from '#src/ports/transcript-registry.ts';
import { countOf } from '#src/recap/domain/count.ts';

const TAIL_BYTES = countOf(256 * 1024);

export type CurrentSession = (pane: PaneId) => Promise<SessionId | null | Unknown>;

interface RecentTail {
    readonly entries: readonly Entry[];
    readonly marks: readonly Mark[];
}

export class LaneRecent {
    private readonly transcripts: TranscriptRegistry;
    private readonly session: CurrentSession;

    constructor(transcripts: TranscriptRegistry, session: CurrentSession) {
        this.transcripts = transcripts;
        this.session = session;
    }

    private async now(lane: Lane): Promise<Lane> {
        const current = await this.session(lane.pane);
        return typeof current === 'string' ? { ...lane, session: must(parseSessionId(current)) } : lane;
    }

    private async tail(lane: Lane): Promise<RecentTail> {
        const agent = lane.agent;
        const reader = this.transcripts.readerFor(agent);
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

    async marks(lane: Lane): Promise<readonly Mark[]> {
        return (await this.tail(lane)).marks;
    }
}
