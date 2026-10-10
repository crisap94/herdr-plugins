import { ClaudeTranscripts } from './claude-transcripts.ts';
import { CodexTranscripts } from './codex-transcripts.ts';
import { OpencodeTranscripts } from './opencode-transcripts.ts';
import { ScreenTranscripts } from './screen-transcripts.ts';
import { registeredKindOf } from '#src/recap/domain/registered-kinds.ts';
import type { RegisteredKind } from '#src/recap/domain/registered-kinds.ts';
import type { Screens } from '#src/ports/screens.ts';
import { TranscriptRegistry } from '#src/ports/transcript-registry.ts';
import type { Transcripts } from '#src/ports/transcripts.ts';

export { TranscriptRegistry } from '#src/ports/transcript-registry.ts';

const READERS = {
    claude: () => new ClaudeTranscripts(),
    codex: () => new CodexTranscripts(),
    opencode: () => new OpencodeTranscripts(),
} as const satisfies Readonly<Record<RegisteredKind, () => Transcripts>>;

export function readerKindOf(raw: string): RegisteredKind | null {
    return registeredKindOf(raw);
}

function registryFrom(readers: Readonly<Record<string, () => Transcripts>>, fallback: Transcripts | null): TranscriptRegistry {
    return new TranscriptRegistry(Object.fromEntries(Object.entries(readers).map(([kind, make]) => [kind, make()])), fallback);
}

export function daemonTranscriptRegistry(screens: Screens, wants: (kind: string) => boolean): TranscriptRegistry {
    return new TranscriptRegistry(Object.fromEntries(Object.entries(READERS).map(([kind, make]) => [kind, make()])), new ScreenTranscripts(screens, wants));
}

export function modalTranscriptRegistry(): TranscriptRegistry {
    return registryFrom(READERS, null);
}

export function replayTranscriptRegistry(): TranscriptRegistry {
    return new TranscriptRegistry({ claude: READERS.claude(), codex: READERS.codex() }, null);
}
