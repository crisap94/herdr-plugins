import { ClaudeTranscripts } from './claude-transcripts.ts';
import { CodexTranscripts } from './codex-transcripts.ts';
import { OpencodeTranscripts } from './opencode-transcripts.ts';
import { ScreenTranscripts } from './screen-transcripts.ts';
import { registeredKindOf } from '#src/recap/domain/registered-kinds.ts';
import type { RegisteredKind } from '#src/recap/domain/registered-kinds.ts';
import type { Screens } from '#src/ports/screens.ts';
import { TranscriptRegistry } from '#src/ports/transcript-registry.ts';
import type { Transcripts } from '#src/ports/transcripts.ts';
import { supported, unsupportedCapability } from '#src/ports/capability.ts';
import type { Capability } from '#src/ports/capability.ts';
import type { HistoryWhy, InFlightWhy } from '#src/ports/capability-reasons.ts';
import { capabilityWording } from '#src/ports/capability-reasons.ts';

export { TranscriptRegistry } from '#src/ports/transcript-registry.ts';

const READERS = {
    claude: supported(() => new ClaudeTranscripts()),
    codex: supported(() => new CodexTranscripts()),
    opencode: supported(() => new OpencodeTranscripts()),
    hermes: unsupportedCapability('history-unavailable'),
} satisfies Readonly<Record<RegisteredKind, Capability<() => Transcripts, HistoryWhy>>>;

export const IN_FLIGHT_CAPABILITIES = {
    claude: supported('reader'),
    codex: supported('reader'),
    opencode: supported('reader'),
    hermes: unsupportedCapability('in-flight-unavailable'),
} satisfies Readonly<Record<RegisteredKind, Capability<'reader', InFlightWhy>>>;

function readersOf(readers: typeof READERS): Readonly<Record<string, Transcripts>> {
    return Object.fromEntries(Object.entries(readers).flatMap(([kind, capability]) => capability.kind === 'supported' ? [[kind, capability.value()]] : []));
}

function unavailableReason(kind: string): string {
    const registered = registeredKindOf(kind);
    if (registered === null) return capabilityWording('history-unavailable', kind);
    const capability = READERS[registered];
    return capability.kind === 'unsupported' ? capabilityWording(capability.why, kind) : capabilityWording('history-unavailable', kind);
}

export function readerKindOf(raw: string): RegisteredKind | null {
    return registeredKindOf(raw);
}

export function daemonTranscriptRegistry(screens: Screens, wants: (kind: string) => boolean): TranscriptRegistry {
    return new TranscriptRegistry(readersOf(READERS), new ScreenTranscripts(screens, wants), unavailableReason);
}

export function modalTranscriptRegistry(): TranscriptRegistry {
    return new TranscriptRegistry(readersOf(READERS), null, unavailableReason);
}

export function replayTranscriptRegistry(): TranscriptRegistry {
    const claude = READERS.claude;
    const codex = READERS.codex;
    if (claude.kind !== 'supported' || codex.kind !== 'supported') throw new Error('Replay readers are unavailable');
    return new TranscriptRegistry({ claude: claude.value(), codex: codex.value() }, null, unavailableReason);
}
