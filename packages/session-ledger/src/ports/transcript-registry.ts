import type { AgentKind } from '#src/recap/domain/lane-shape.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Transcripts } from './transcripts.ts';

export { agentKindOf, type AgentKind } from '#src/recap/domain/lane-shape.ts';

export type TranscriptReaders = ReadonlyMap<AgentKind, Transcripts>;

export class TranscriptRegistry {
    private readonly readers: TranscriptReaders;
    private readonly fallback: Transcripts | null;
    private readonly unavailable: (kind: AgentKind) => Text;

    constructor(readers: TranscriptReaders, fallback: Transcripts | null, unavailable: (kind: AgentKind) => Text) {
        this.readers = readers;
        this.fallback = fallback;
        this.unavailable = unavailable;
    }

    exact(kind: AgentKind): Transcripts | undefined {
        return this.readers.get(kind);
    }

    readerFor(kind: AgentKind): Transcripts | undefined {
        return this.exact(kind) ?? this.fallback ?? undefined;
    }

    unavailableReason(kind: AgentKind): Text {
        return this.unavailable(kind);
    }
}
