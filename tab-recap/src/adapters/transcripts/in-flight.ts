import { inFlightReason } from '@stateforge-labs/session-ledger';
import { capabilityWording } from '@stateforge-labs/session-ledger';
import type { InFlightReader, InFlightRead } from '#src/ports/in-flight.ts';
import type { TranscriptRegistry } from '@stateforge-labs/session-ledger';
import { isUnknown } from '@stateforge-labs/session-ledger';
import { saying } from '#src/recap/domain/saying.ts';
import type { Unknown } from '@stateforge-labs/session-ledger';
import { seatOf, type FollowedSession } from '#src/recap/domain/lane.ts';
import { registeredKindOf } from '@stateforge-labs/session-ledger';
import type { Directory } from '@stateforge-labs/session-ledger';
import type { SessionId } from '#src/recap/domain/ids.ts';
import type { RegisteredKind } from '@stateforge-labs/session-ledger';
import { IN_FLIGHT_CAPABILITIES } from './registry.ts';
import { must } from '@stateforge-labs/session-ledger';
import { parseText, textOf } from '@stateforge-labs/session-ledger';
import { countOf } from '@stateforge-labs/session-ledger';

const TAIL_BYTES = 512 * 1024;

const LOCATING_KEYS = {
    claude: (lane: FollowedSession): SessionId | null => lane.session,
    codex: (lane: FollowedSession): Directory | null => lane.cwd,
    opencode: (lane: FollowedSession): Directory | null => lane.cwd,
} satisfies Readonly<Record<RegisteredKind, (lane: FollowedSession) => SessionId | Directory | null>>;

function unlocated(lane: FollowedSession, registered: RegisteredKind | null, located: Unknown): InFlightRead {
    const why = saying(located.why);
    const fresh = located.why.why === 'not-found' && registered !== null && LOCATING_KEYS[registered](lane) !== null;
    return fresh ? { kind: 'not-started', why } : { kind: 'unknown', why };
}

export class TranscriptInFlight implements InFlightReader {
    private readonly transcripts: TranscriptRegistry;

    constructor(transcripts: TranscriptRegistry) {
        this.transcripts = transcripts;
    }

    async read(lane: FollowedSession): Promise<InFlightRead> {
        const agent = lane.agent;
        const subject = must(parseText(agent));
        const registered = registeredKindOf(textOf(agent));
        if (registered !== null) {
            const capability = IN_FLIGHT_CAPABILITIES[registered];
            if (capability.kind === 'unsupported') return { kind: 'unknown', why: capabilityWording(capability.why, subject) };
        }
        const exact = this.transcripts.exact(agent);
        const reader = exact ?? this.transcripts.readerFor(agent);
        if (reader === undefined) return { kind: 'unknown', why: inFlightReason('unregistered-reader', subject) };
        const located = await reader.locate(seatOf(lane));
        if (isUnknown(located)) return exact === undefined ? { kind: 'unknown', why: inFlightReason('unregistered-reader', subject) } : unlocated(lane, registered, located);
        if (reader.inFlight.kind === 'unsupported') return { kind: 'unknown', why: inFlightReason(reader.inFlight.why, subject) };
        const found = await reader.inFlight.read(located.source, countOf(TAIL_BYTES));
        return isUnknown(found) ? { kind: 'unknown', why: saying(found.why) } : { kind: 'count', count: countOf(found.count), background: found.background };
    }
}
