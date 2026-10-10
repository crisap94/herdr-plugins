import type { CompactionPlanResult } from '#src/recap/domain/compaction-plan.ts';

export interface CompactionPlans {
    forKind(rawKind: string, guidance: string): CompactionPlanResult;
}
