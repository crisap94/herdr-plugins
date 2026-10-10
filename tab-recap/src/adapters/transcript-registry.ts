import { ClaudeTranscripts } from './claude-transcripts.ts';
import { CodexTranscripts } from './codex-transcripts.ts';
import { OpencodeTranscripts } from './opencode-transcripts.ts';
import { ScreenTranscripts } from './screen-transcripts.ts';
import { registeredKindOf } from '#src/recap/domain/registered-kinds.ts';
import type { RegisteredKind } from '#src/recap/domain/registered-kinds.ts';
import type { Screens } from '#src/ports/screens.ts';
import { TranscriptRegistry } from '#src/ports/transcript-registry.ts';
import type { Transcripts } from '#src/ports/transcripts.ts';
import { supported } from '#src/ports/capability.ts';
import type { Capability } from '#src/ports/capability.ts';

export { TranscriptRegistry } from '#src/ports/transcript-registry.ts';

const READERS = {
    claude: supported(() => new ClaudeTranscripts()),
    codex: supported(() => new CodexTranscripts()),
    opencode: supported(() => new OpencodeTranscripts()),
} satisfies Readonly<Record<RegisteredKind, Capability<() => Transcripts>>>;

function readersOf(readers: typeof READERS): Readonly<Record<string, Transcripts>> {
    return Object.fromEntries(Object.entries(readers).flatMap(([kind, capability]) => capability.kind === 'supported' ? [[kind, capability.value()]] : []));
}

export function readerKindOf(raw: string): RegisteredKind | null {
    return registeredKindOf(raw);
}

export function daemonTranscriptRegistry(screens: Screens, wants: (kind: string) => boolean): TranscriptRegistry {
    return new TranscriptRegistry(readersOf(READERS), new ScreenTranscripts(screens, wants));
}

export function modalTranscriptRegistry(): TranscriptRegistry {
    return new TranscriptRegistry(readersOf(READERS), null);
}

export function replayTranscriptRegistry(): TranscriptRegistry {
    const claude = READERS.claude;
    const codex = READERS.codex;
    if (claude.kind !== 'supported' || codex.kind !== 'supported') throw new Error('Replay readers are unavailable');
    return new TranscriptRegistry({ claude: claude.value(), codex: codex.value() }, null);
}
