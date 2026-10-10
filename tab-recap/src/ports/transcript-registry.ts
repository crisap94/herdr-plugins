import type { Transcripts } from './transcripts.ts';

export class TranscriptRegistry {
    private readonly readers: Readonly<Record<string, Transcripts>>;
    private readonly fallback: Transcripts | null;

    constructor(readers: Readonly<Record<string, Transcripts>>, fallback: Transcripts | null) {
        this.readers = readers;
        this.fallback = fallback;
    }

    exact(kind: string): Transcripts | undefined {
        return Object.hasOwn(this.readers, kind) ? this.readers[kind] : undefined;
    }

    readerFor(kind: string): Transcripts | undefined {
        return this.exact(kind) ?? this.fallback ?? undefined;
    }
}
