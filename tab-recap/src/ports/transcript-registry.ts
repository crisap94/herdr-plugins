import type { Transcripts } from './transcripts.ts';

export class TranscriptRegistry {
    private readonly readers: Readonly<Record<string, Transcripts>>;
    private readonly fallback: Transcripts | null;
    private readonly unavailable: (kind: string) => string;

    constructor(readers: Readonly<Record<string, Transcripts>>, fallback: Transcripts | null, unavailable: (kind: string) => string = (kind): string => `no reader for ${kind}`) {
        this.readers = readers;
        this.fallback = fallback;
        this.unavailable = unavailable;
    }

    exact(kind: string): Transcripts | undefined {
        return Object.hasOwn(this.readers, kind) ? this.readers[kind] : undefined;
    }

    readerFor(kind: string): Transcripts | undefined {
        return this.exact(kind) ?? this.fallback ?? undefined;
    }

    unavailableReason(kind: string): string {
        return this.unavailable(kind);
    }
}
