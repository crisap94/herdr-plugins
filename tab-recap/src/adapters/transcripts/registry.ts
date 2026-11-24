import { ClaudeTranscripts } from './claude/transcripts.ts';
import { CodexTranscripts } from './codex/transcripts.ts';
import { OpencodeTranscripts } from './opencode/transcripts.ts';
import { ScreenTranscripts } from './screen.ts';
import type { ScreenWants } from './screen.ts';
import type { ScreenReader } from '#src/ports/screens.ts';
import { TranscriptRegistry, type TranscriptReaders } from '@stateforge-labs/session-ledger';
import { type HarnessKind, parseAgentKind } from '#src/recap/domain/ids.ts';
import type { LegacySessionReader as SessionReader } from '@stateforge-labs/session-ledger';
import { supported } from '#src/ports/capability.ts';
import type { Support } from '#src/ports/capability.ts';
import type { HistoryWhy, InFlightWhy } from '@stateforge-labs/session-ledger';
import { capabilityWording } from '@stateforge-labs/session-ledger';
import { registeredKindOf } from '@stateforge-labs/session-ledger';
import type { RegisteredKind } from '@stateforge-labs/session-ledger';
import { harnessOfTranscriptPath } from '@stateforge-labs/harness-adapters';
import type { FsPath } from '#src/recap/domain/fs-path.ts';
import { must } from '@stateforge-labs/session-ledger';
import { parseText, type Text, textOf } from '@stateforge-labs/session-ledger';

export { TranscriptRegistry } from '@stateforge-labs/session-ledger';

const CODEX_HOME_MARKER = '/.codex/';

export function replayKindOfPath(flag: Text | null, file: FsPath): RegisteredKind | null {
    return registeredKindOf(textOf(flag ?? harnessOfTranscriptPath(file) ?? (file.includes(CODEX_HOME_MARKER) ? 'codex' : 'claude')));
}

type ReaderSet = Readonly<Record<RegisteredKind, Support<() => SessionReader, HistoryWhy>>>;


const READERS = {
    claude: supported(() => new ClaudeTranscripts()),
    codex: supported(() => new CodexTranscripts()),
    opencode: supported(() => new OpencodeTranscripts()),
} satisfies ReaderSet;

export const IN_FLIGHT_CAPABILITIES = {
    claude: supported('reader'),
    codex: supported('reader'),
    opencode: supported('reader'),
} satisfies Readonly<Record<RegisteredKind, Support<'reader', InFlightWhy>>>;

function readersOf(readers: ReaderSet): TranscriptReaders {
    return new Map(Object.entries(readers).flatMap(([kind, capability]): [HarnessKind, SessionReader][] => capability.kind === 'supported' ? [[must(parseAgentKind(kind)), capability.value()]] : []));
}

function unavailableReason(kind: HarnessKind): Text {
    const subject = must(parseText(kind));
    const registered = registeredKindOf(textOf(kind));
    if (registered === null) return capabilityWording('history-unavailable', subject);
    const capability = READERS[registered];
    return capability.kind === 'unsupported' ? capabilityWording(capability.why, subject) : capabilityWording('history-unavailable', subject);
}

export function daemonTranscriptRegistry(screens: ScreenReader, wants: ScreenWants): TranscriptRegistry {
    return new TranscriptRegistry(readersOf(READERS), new ScreenTranscripts(screens, wants), unavailableReason);
}

export function modalTranscriptRegistry(): TranscriptRegistry {
    return new TranscriptRegistry(readersOf(READERS), null, unavailableReason);
}

export function replayTranscriptRegistry(): TranscriptRegistry {
    const claude = READERS.claude;
    const codex = READERS.codex;
    if (claude.kind !== 'supported' || codex.kind !== 'supported') throw new Error('Replay readers are unavailable');
    return new TranscriptRegistry(new Map<HarnessKind, SessionReader>([[must(parseAgentKind('claude')), claude.value()], [must(parseAgentKind('codex')), codex.value()]]), null, unavailableReason);
}
