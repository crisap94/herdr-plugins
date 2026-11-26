import type { FollowedSession } from '#src/recap/domain/lane.ts';
import { isUnknown } from '@stateforge-labs/session-ledger';
import type { TranscriptRegistry } from '@stateforge-labs/session-ledger';
import type { SessionKey } from '#src/recap/domain/ids.ts';
import type { Presence } from '#src/recap/domain/presence.ts';
import { textOf, type Text } from '@stateforge-labs/session-ledger';
import { countOf } from '@stateforge-labs/session-ledger';

const TAIL_BYTES = countOf(256 * 1024);
const REMEMBERED = 200;

export class LivePrompts {
    private readonly transcripts: TranscriptRegistry;
    private readonly known = new Map<SessionKey, Text>();

    constructor(transcripts: TranscriptRegistry) {
        this.transcripts = transcripts;
    }

    of(pane: SessionKey): Text | null {
        return this.known.get(pane) ?? null;
    }

    async refresh(lane: FollowedSession): Promise<Presence> {
        const agent = lane.agent;
        const reader = this.transcripts.readerFor(agent);
        if (reader === undefined) {
            return 'absent';
        }
        const located = await reader.locate(lane);
        if (isUnknown(located)) {
            return 'absent';
        }
        const found = await reader.latestPrompt(located.source, TAIL_BYTES);
        const pane = lane.pane;
        if (isUnknown(found) || found.text === null || found.text === this.known.get(pane)) {
            return 'absent';
        }
        this.known.delete(pane);
        this.known.set(pane, textOf(found.text));
        if (this.known.size > REMEMBERED) {
            const oldest = this.known.keys().next().value;
            if (oldest !== undefined) {
                this.known.delete(oldest);
            }
        }
        return 'present';
    }
}
