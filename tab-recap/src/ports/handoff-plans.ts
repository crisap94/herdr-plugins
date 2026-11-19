import type { HandoffPlanResult } from '#src/recap/domain/handoff-plan.ts';
import type { AgentKind } from '#src/recap/domain/ids.ts';

export type { HandoffPlans } from './twins/runs/legacy.ts';

export interface HandoffPlanCatalogue {
    forKind(kind: AgentKind): HandoffPlanResult;
}
