import { ClaudeTranscripts } from './claude-transcripts.ts';
import { CodexTranscripts } from './codex-transcripts.ts';
import { OpencodeTranscripts } from './opencode-transcripts.ts';
import { ScreenTranscripts } from './screen-transcripts.ts';
import type { Screens } from '#src/ports/screens.ts';
import { TranscriptRegistry } from '#src/ports/transcripts.ts';
import type { ReaderKind, Transcripts } from '#src/ports/transcripts.ts';

export { TranscriptRegistry } from '#src/ports/transcripts.ts';
export type { ReaderKind, TranscriptRegistryInput } from '#src/ports/transcripts.ts';

const readers: Readonly<Record<ReaderKind, () => Transcripts>> = {
    claude: () => new ClaudeTranscripts(),
    codex: () => new CodexTranscripts(),
    opencode: () => new OpencodeTranscripts(),
};

function registryOf(kinds: readonly ReaderKind[], fallback: Transcripts | null): TranscriptRegistry {
    return new TranscriptRegistry(Object.fromEntries(kinds.map((kind) => [kind, readers[kind]()])), fallback);
}

export function daemonTranscriptRegistry(screens: Screens, wants: (kind: string) => boolean): TranscriptRegistry {
    return registryOf(Object.keys(readers) as ReaderKind[], new ScreenTranscripts(screens, wants));
}

export function modalTranscriptRegistry(): TranscriptRegistry {
    return registryOf(Object.keys(readers) as ReaderKind[], null);
}

export function replayTranscriptRegistry(): TranscriptRegistry {
    return registryOf(['claude', 'codex'], null);
}
