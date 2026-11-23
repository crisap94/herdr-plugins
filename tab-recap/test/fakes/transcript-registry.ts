import { TranscriptRegistry } from '#src/ports/transcript-registry.ts';
import type { Transcripts } from '#src/ports/transcripts.ts';
import { capabilityWording } from '#src/ports/capability-reasons.ts';
import { parseText } from '#src/recap/domain/text.ts';
import { must } from '#src/protocol/result.ts';
import { type AgentKind } from '#src/recap/domain/ids.ts';
import { agentKind } from '#test/support/ids.ts';

export function registryWith(readers: Readonly<Record<string, Transcripts>>, fallback: Transcripts | null = null): TranscriptRegistry {
    return new TranscriptRegistry(new Map(Object.entries(readers).map(([kind, reader]): [AgentKind, Transcripts] => [agentKind(kind), reader])), fallback, (kind) => capabilityWording('history-unavailable', must(parseText(kind))));
}
