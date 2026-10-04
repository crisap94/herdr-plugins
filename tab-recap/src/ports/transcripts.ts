import type { Lane } from '#src/recap/domain/lane.ts';
import type { Unknown } from './unknowable.ts';

export interface Entry {
    readonly role: 'user' | 'agent' | 'tool';
    readonly text: string;
}

export interface Chunk {
    readonly kind: 'chunk';
    readonly entries: readonly Entry[];
    readonly title: string | null;
    readonly lastPrompt: string | null;
    readonly claudeRecap: string | null;
    /** the byte after the last complete line read: the next cursor */
    readonly end: number;
    readonly size: number;
}

export type Located = { readonly kind: 'located'; readonly path: string; readonly size: number } | Unknown;

export type ChunkResult = Chunk | Unknown;

/** One adapter per agent kind; each knows where its transcripts live and how to read them. */
export interface Transcripts {
    readonly agent: string;
    locate(lane: Lane): Located;
    read(path: string, from: number, budget: number): ChunkResult;
}
