import type { Lane } from '#src/recap/domain/lane.ts';
import type { Observed } from '#src/recap/domain/compaction.ts';
import type { Unknown } from './unknowable.ts';

export type CallKind = 'shell' | 'edit' | 'web' | 'agent' | 'other' | 'read';

export interface Entry {
    readonly role: 'user' | 'agent' | 'tool';
    readonly text: string;
    readonly at?: number;
    readonly queued?: boolean;
    readonly kind?: CallKind;
    readonly what?: string;
}

export interface AgentNote {
    readonly kind: 'away_summary' | 'compaction';
    readonly at: number | null;
    readonly text: string;
}

export interface Position {
    readonly cursor: number;
    readonly tail: string | null;
}

export const UNREAD: Position = { cursor: 0, tail: null };

export interface Mark {
    readonly kind: 'compacted' | 'compaction-failed';
    readonly at: number | null;
    readonly tokensBefore?: number;
    readonly tokensAfter?: number;
    readonly tookMs?: number;
    readonly trigger?: 'auto' | 'manual';
}

export interface Chunk {
    readonly kind: 'chunk';
    readonly entries: readonly Entry[];
    readonly title: string | null;
    readonly lastPrompt: string | null;
    readonly claudeRecap: string | null;
    readonly notes: readonly AgentNote[];
    readonly marks?: readonly Mark[];
    readonly position: Position;
    readonly grew: boolean;
}

export type Located = { readonly kind: 'located'; readonly source: string } | Unknown;

export type ChunkResult = Chunk | Unknown;

export type PromptResult = { readonly kind: 'prompt'; readonly text: string | null } | Unknown;

export type ObservedResult = { readonly kind: 'observed'; readonly observed: Observed | null } | Unknown;

export type InFlightResult = { readonly kind: 'in-flight'; readonly count: number } | Unknown;

export interface Transcripts {
    readonly agent: string;
    locate(lane: Lane): Promise<Located>;
    read(source: string, was: Position, budget: number): Promise<ChunkResult>;
    latestPrompt(source: string, budget: number): Promise<PromptResult>;
    observed?(source: string, budget: number): Promise<ObservedResult>;
    inFlight?(source: string, budget: number): Promise<InFlightResult>;
}

export type ReaderKind = 'claude' | 'codex' | 'opencode';

export function readerKindOf(raw: string): ReaderKind | null {
    switch (raw) {
        case 'claude':
        case 'codex':
        case 'opencode':
            return raw;
        default:
            return null;
    }
}

export class TranscriptRegistry {
    private readonly readers: Readonly<Partial<Record<ReaderKind, Transcripts>>>;
    private readonly fallback: Transcripts | null;

    constructor(readers: Readonly<Partial<Record<ReaderKind, Transcripts>>>, fallback: Transcripts | null) {
        this.readers = readers;
        this.fallback = fallback;
    }

    exact(kind: string): Transcripts | undefined {
        const parsed = readerKindOf(kind);
        return parsed === null ? undefined : this.readers[parsed];
    }

    readerFor(kind: string): Transcripts | undefined {
        return this.exact(kind) ?? this.fallback ?? undefined;
    }

    kinds(): readonly ReaderKind[] {
        return Object.keys(this.readers).filter((kind): kind is ReaderKind => readerKindOf(kind) !== null);
    }
}

export type TranscriptRegistryInput = TranscriptRegistry | readonly Transcripts[];

export function registryOf(input: TranscriptRegistryInput): TranscriptRegistry {
    if (input instanceof TranscriptRegistry) {
        return input;
    }
    const readers: Partial<Record<ReaderKind, Transcripts>> = {};
    let fallback: Transcripts | null = null;
    for (const reader of input) {
        const kind = readerKindOf(reader.agent);
        if (kind !== null) {
            readers[kind] = reader;
        } else if (reader.agent === '*') {
            fallback = reader;
        }
    }
    return new TranscriptRegistry(readers, fallback);
}
