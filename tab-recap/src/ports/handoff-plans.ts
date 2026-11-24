import type { HandoffPlanResult } from '#src/recap/domain/handoff-plan.ts';
import type { HarnessKind } from '#src/recap/domain/ids.ts';

export interface HandoffPlanCatalogue {
    forKind(kind: HarnessKind): HandoffPlanResult;
}
