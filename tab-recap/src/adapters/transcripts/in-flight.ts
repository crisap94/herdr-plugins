import { inFlightReason } from '#src/ports/autocompact-reasons.ts';
import { capabilityWording } from '#src/ports/capability-reasons.ts';
import type { InFlight, InFlightReading } from '#src/ports/in-flight.ts';
import type { TranscriptRegistry } from '#src/ports/transcript-registry.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import type { Unknown } from '#src/ports/unknowable.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import { registeredKindOf } from '#src/recap/domain/registered-kinds.ts';
import type { Directory } from '#src/recap/domain/directory.ts';
import type { SessionId } from '#src/recap/domain/ids.ts';
import type { RegisteredKind } from '#src/recap/domain/registered-kinds.ts';
import { IN_FLIGHT_CAPABILITIES } from './registry.ts';
import { must } from '#src/protocol/result.ts';
import { parseText } from '#src/recap/domain/text.ts';

const TAIL_BYTES = 512 * 1024;

const LOCATING_KEYS = {
    claude: (lane: Lane): SessionId | null => lane.session,
    codex: (lane: Lane): Directory | null => lane.cwd,
    opencode: (lane: Lane): Directory | null => lane.cwd,
} satisfies Readonly<Record<RegisteredKind, (lane: Lane) => SessionId | Directory | null>>;

function unlocated(lane: Lane, registered: RegisteredKind | null, located: Unknown): InFlightReading {
    const why = saying(located.why);
    const fresh = located.why.why === 'not-found' && registered !== null && LOCATING_KEYS[registered](lane) !== null;
    return fresh ? { kind: 'not-started', why } : { kind: 'unknown', why };
}

export class TranscriptInFlight implements InFlight {
    private readonly transcripts: TranscriptRegistry;

    constructor(transcripts: TranscriptRegistry) {
        this.transcripts = transcripts;
    }

    async read(lane: Lane): Promise<InFlightReading> {
        const agent = String(lane.agent);
        const subject = must(parseText(agent));
        const registered = registeredKindOf(agent);
        if (registered !== null) {
            const capability = IN_FLIGHT_CAPABILITIES[registered];
            if (capability.kind === 'unsupported') return { kind: 'unknown', why: capabilityWording(capability.why, subject) };
        }
        const exact = this.transcripts.exact(agent);
        const reader = exact ?? this.transcripts.readerFor(agent);
        if (reader === undefined) return { kind: 'unknown', why: inFlightReason('unregistered-reader', subject) };
        const located = await reader.locate(lane);
        if (isUnknown(located)) return exact === undefined ? { kind: 'unknown', why: inFlightReason('unregistered-reader', subject) } : unlocated(lane, registered, located);
        if (reader.inFlight.kind === 'unsupported') return { kind: 'unknown', why: inFlightReason(reader.inFlight.why, subject) };
        const found = await reader.inFlight.read(located.source, TAIL_BYTES);
        return isUnknown(found) ? { kind: 'unknown', why: saying(found.why) } : { kind: 'count', count: found.count, background: found.background };
    }
}
