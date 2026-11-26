import { must } from '@stateforge-labs/session-ledger';
import { seatOf, type FollowedSession } from '#src/recap/domain/lane.ts';
import { type SessionKey, type SessionId, parseSessionId } from '#src/recap/domain/ids.ts';
import { UNREAD, type Entry, type Mark } from '@stateforge-labs/session-ledger';
import { isUnknown, type Unknown } from '@stateforge-labs/session-ledger';
import type { TranscriptRegistry } from '@stateforge-labs/session-ledger';
import { countOf } from '@stateforge-labs/session-ledger';

const TAIL_BYTES = countOf(256 * 1024);

export type CurrentSession = (pane: SessionKey) => Promise<SessionId | null | Unknown>;

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

    private async now(lane: FollowedSession): Promise<FollowedSession> {
        const current = await this.session(lane.pane);
        return typeof current === 'string' ? { ...lane, session: must(parseSessionId(current)) } : lane;
    }

    private async tail(lane: FollowedSession): Promise<RecentTail> {
        const agent = lane.agent;
        const reader = this.transcripts.readerFor(agent);
        const current = await this.now(lane);
        const located = reader === undefined ? null : await reader.locate(seatOf(current));
        if (reader === undefined || located === null || isUnknown(located)) {
            return { entries: [], marks: [] };
        }
        const chunk = await reader.read(located.source, UNREAD, TAIL_BYTES);
        return isUnknown(chunk) ? { entries: [], marks: [] } : { entries: chunk.entries, marks: chunk.marks ?? [] };
    }

    async of(lane: FollowedSession): Promise<readonly Entry[]> {
        return (await this.tail(lane)).entries;
    }

    async marks(lane: FollowedSession): Promise<readonly Mark[]> {
        return (await this.tail(lane)).marks;
    }
}
