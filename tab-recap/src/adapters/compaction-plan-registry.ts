import { compactionLine, compactionPiece, confirmationReads } from '#src/recap/domain/compaction-plan.ts';
import type { CompactionPlanFactory, CompactionPlanResult } from '#src/recap/domain/compaction-plan.ts';
import { duration } from '#src/recap/domain/time.ts';
import { registeredKindOf } from '#src/recap/domain/registered-kinds.ts';
import type { RegisteredKind } from '#src/recap/domain/registered-kinds.ts';
import { unsupported } from '#src/recap/domain/compaction-plan.ts';
import type { CompactionPlans } from '#src/ports/compaction-plans.ts';

const claude: CompactionPlanFactory = (guidance) => ({
    lines: [compactionLine(compactionPiece('/compact '), compactionPiece(guidance))],
    enterDelay: duration(300),
    acceptsStall: true,
    confirm: { kind: 'turn-end' },
    retryOnSelfFailure: true,
    followUp: { kind: 'none' },
    takesGuidance: true,
});

const polling: CompactionPlanFactory = (_guidance) => ({
    lines: [compactionLine(compactionPiece('/compact'))],
    enterDelay: duration(300),
    acceptsStall: true,
    confirm: { kind: 'poll', reads: confirmationReads(20), every: duration(1000) },
    retryOnSelfFailure: false,
    followUp: { kind: 'restore-message' },
    takesGuidance: false,
});

export const COMPACTION_PLANS = {
    claude,
    codex: polling,
    opencode: polling,
} satisfies Readonly<Record<RegisteredKind, CompactionPlanFactory>>;

export const compactionPlans: CompactionPlans = {
    forKind(rawKind: string, guidance: string): CompactionPlanResult {
        const kind = registeredKindOf(rawKind);
        if (kind === null) {
            return unsupported(`no compaction plan is registered for ${rawKind}`);
        }
        const plan = COMPACTION_PLANS[kind](guidance);
        return 'kind' in plan ? plan : { kind: 'supported', plan };
    },
};
