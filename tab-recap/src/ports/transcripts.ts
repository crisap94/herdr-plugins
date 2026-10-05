import type { Lane } from '#src/recap/domain/lane.ts';
import type { Unknown } from './unknowable.ts';

export interface Entry {
    readonly role: 'user' | 'agent' | 'tool';
    readonly text: string;
}

/**
 * How far a source has been read. The READER owns what the number means: bytes for a JSONL file, the newest
 * `time_updated` read for opencode, herdr's `revision` for a screen. `tail` tells a changed screen from a repainted one.
 */
export interface Position {
    readonly cursor: number;
    readonly tail: string | null;
}

export const UNREAD: Position = { cursor: 0, tail: null };

export interface Chunk {
    readonly kind: 'chunk';
    readonly entries: readonly Entry[];
    readonly title: string | null;
    readonly lastPrompt: string | null;
    readonly claudeRecap: string | null;
    /** where the next read starts */
    readonly position: Position;
    /** the source holds something past `was`, whether or not it made entries */
    readonly grew: boolean;
}

/** `source` names ONE place a lane is read from and is unique to it: a path, `<db>#<session>`, `screen:<pane>`. */
export type Located = { readonly kind: 'located'; readonly source: string } | Unknown;

export type ChunkResult = Chunk | Unknown;

/** The newest user prompt of a source; `text` is null when it holds none (or cannot say, like a screen). */
export type PromptResult = { readonly kind: 'prompt'; readonly text: string | null } | Unknown;

/** One adapter per kind of agent (`*`: any agent without a store of its own); each knows where its history lives and how to read it. */
export interface Transcripts {
    readonly agent: string;
    locate(lane: Lane): Promise<Located>;
    /** What `source` holds after `was`, at most about `budget` bytes of it (the most recent when there is more). */
    read(source: string, was: Position, budget: number): Promise<ChunkResult>;
    /** Only the newest user prompt, from at most `budget` bytes at the end of `source`. Moves no position. */
    latestPrompt(source: string, budget: number): Promise<PromptResult>;
}
