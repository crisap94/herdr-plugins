import { compactionPlanner } from '#src/adapters/capability/compaction-plans.ts';
import { textOf } from '#src/recap/domain/text.ts';
import type { CompactionPlanner } from '#src/ports/compaction-plans.ts';
import { needsIdle } from '#src/recap/domain/compaction-plan.ts';

export const idleClaudePlans: CompactionPlanner = {
    forKind: (kind, guidance) => {
        const planned = compactionPlanner.forKind(kind, guidance);
        return planned.kind === 'supported' && kind === 'claude' ? { kind: 'supported', plan: { ...planned.plan, whileWorking: needsIdle(textOf('claude needs the lane idle in this test')) } } : planned;
    },
};
