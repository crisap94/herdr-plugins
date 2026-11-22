import { ClaudeTranscripts } from './claude/transcripts.ts';
import { CodexTranscripts } from './codex/transcripts.ts';
import { OpencodeTranscripts } from './opencode/transcripts.ts';
import { ScreenTranscripts } from './screen.ts';
import type { ScreenWants } from './screen.ts';
import type { Screens } from '#src/ports/screens.ts';
import { TranscriptRegistry } from '#src/ports/transcript-registry.ts';
import type { Transcripts } from '#src/ports/transcripts.ts';
import { supported } from '#src/ports/capability.ts';
import type { Capability } from '#src/ports/capability.ts';
import type { HistoryWhy, InFlightWhy } from '#src/ports/capability-reasons.ts';
import { capabilityWording } from '#src/ports/capability-reasons.ts';
import { registeredKindOf } from '#src/recap/domain/registered-kinds.ts';
import type { RegisteredKind } from '#src/recap/domain/registered-kinds.ts';
import { must } from '#src/protocol/result.ts';
import { parseText } from '#src/recap/domain/text.ts';

export { TranscriptRegistry } from '#src/ports/transcript-registry.ts';
export { readerKindOf, replayKindOf } from './legacy.ts';

type ReaderSet = Readonly<Record<RegisteredKind, Capability<() => Transcripts, HistoryWhy>>>;


const READERS = {
    claude: supported(() => new ClaudeTranscripts()),
    codex: supported(() => new CodexTranscripts()),
    opencode: supported(() => new OpencodeTranscripts()),
} satisfies ReaderSet;

export const IN_FLIGHT_CAPABILITIES = {
    claude: supported('reader'),
    codex: supported('reader'),
    opencode: supported('reader'),
} satisfies Readonly<Record<RegisteredKind, Capability<'reader', InFlightWhy>>>;

function readersOf(readers: ReaderSet): Readonly<Record<string, Transcripts>> {
    return Object.fromEntries(Object.entries(readers).flatMap(([kind, capability]) => capability.kind === 'supported' ? [[kind, capability.value()]] : []));
}

function unavailableReason(kind: string): string {
    const subject = must(parseText(kind));
    const registered = registeredKindOf(kind);
    if (registered === null) return capabilityWording('history-unavailable', subject);
    const capability = READERS[registered];
    return capability.kind === 'unsupported' ? capabilityWording(capability.why, subject) : capabilityWording('history-unavailable', subject);
}

export function daemonTranscriptRegistry(screens: Screens, wants: ScreenWants): TranscriptRegistry {
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
