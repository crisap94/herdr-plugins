import { TranscriptRegistry } from '@stateforge-labs/session-ledger';
import type { LegacySessionReader as SessionReader } from '@stateforge-labs/session-ledger';
import { capabilityWording } from '@stateforge-labs/session-ledger';
import { parseText } from '@stateforge-labs/session-ledger';
import { must } from '@stateforge-labs/session-ledger';
import { type HarnessKind } from '#src/recap/domain/ids.ts';
import { agentKind } from '#test/support/ids.ts';

export function registryWith(readers: Readonly<Record<string, SessionReader>>, fallback: SessionReader | null = null): TranscriptRegistry {
    return new TranscriptRegistry(new Map(Object.entries(readers).map(([kind, reader]): [HarnessKind, SessionReader] => [agentKind(kind), reader])), fallback, (kind) => capabilityWording('history-unavailable', must(parseText(kind))));
}
