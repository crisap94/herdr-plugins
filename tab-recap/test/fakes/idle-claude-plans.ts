import { compactionPlans } from '#src/adapters/compaction-plan-registry.ts';
import type { CompactionPlans } from '#src/ports/compaction-plans.ts';
import { needsIdle } from '#src/recap/domain/compaction-plan.ts';

export const idleClaudePlans: CompactionPlans = {
    forKind: (kind, guidance) => {
        const planned = compactionPlans.forKind(kind, guidance);
        return planned.kind === 'supported' && kind === 'claude' ? { kind: 'supported', plan: { ...planned.plan, whileWorking: needsIdle('claude needs the lane idle in this test') } } : planned;
    },
};
