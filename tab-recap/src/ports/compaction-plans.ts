import type { CompactionPlanResult } from '#src/recap/domain/compaction-plan.ts';
import type { HarnessKind } from '#src/recap/domain/ids.ts';
import type { Text } from '#src/recap/domain/text.ts';

export interface CompactionPlanner {
    forKind(kind: HarnessKind, guidance: Text): CompactionPlanResult;
}
