import { TranscriptRegistry } from '#src/ports/transcript-registry.ts';
import type { Transcripts } from '#src/ports/transcripts.ts';
import { capabilityWording } from '#src/ports/capability-reasons.ts';

export function registryWith(readers: Readonly<Record<string, Transcripts>>, fallback: Transcripts | null = null): TranscriptRegistry {
    return new TranscriptRegistry(readers, fallback, (kind): string => capabilityWording('history-unavailable', kind));
}
