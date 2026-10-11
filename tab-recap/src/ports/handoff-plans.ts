import type { HandoffPlanResult } from '#src/recap/domain/handoff-plan.ts';

export interface HandoffPlans {
    forKind(rawKind: string): HandoffPlanResult;
}
