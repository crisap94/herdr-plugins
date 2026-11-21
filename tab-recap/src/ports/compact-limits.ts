import type { Count } from '#src/recap/domain/count.ts';
import type { AgentKind } from '#src/recap/domain/ids.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Directory } from '@stateforge-labs/session-ledger/unstable/recap/domain/directory.ts';

export interface CompactLimits {
    limitOf(kind: AgentKind, model: Text | null, cwd: Directory | null): Count | null;
}
