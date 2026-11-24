import type { CompactionPlanResult } from '#src/recap/domain/compaction-plan.ts';
import type { HarnessKind } from '#src/recap/domain/ids.ts';
import type { Text } from '@stateforge-labs/session-ledger';

export interface CompactionPlanner {
    forKind(kind: HarnessKind, guidance: Text): CompactionPlanResult;
}
