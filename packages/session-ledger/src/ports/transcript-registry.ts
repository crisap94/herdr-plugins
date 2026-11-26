import type { HarnessKind } from '#src/recap/domain/followed-session-shape.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { SessionReader } from './transcripts.ts';

export { agentKindOf, type HarnessKind } from '#src/recap/domain/followed-session-shape.ts';

export type TranscriptReaders = ReadonlyMap<HarnessKind, SessionReader>;

export class TranscriptRegistry {
    private readonly readers: TranscriptReaders;
    private readonly fallback: SessionReader | null;
    private readonly unavailable: (kind: HarnessKind) => Text;

    constructor(readers: TranscriptReaders, fallback: SessionReader | null, unavailable: (kind: HarnessKind) => Text) {
        this.readers = readers;
        this.fallback = fallback;
        this.unavailable = unavailable;
    }

    exact(kind: HarnessKind): SessionReader | undefined {
        return this.readers.get(kind);
    }

    readerFor(kind: HarnessKind): SessionReader | undefined {
        return this.exact(kind) ?? this.fallback ?? undefined;
    }

    unavailableReason(kind: HarnessKind): Text {
        return this.unavailable(kind);
    }
}
