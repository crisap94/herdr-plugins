import type { CompactionPlanResult } from '#src/recap/domain/compaction-plan.ts';
import type { AgentKind } from '#src/recap/domain/ids.ts';
import type { Text } from '#src/recap/domain/text.ts';

export type { CompactionPlans } from './twins/legacy.ts';

export interface CompactionPlanner {
    forKind(kind: AgentKind, guidance: Text): CompactionPlanResult;
}
