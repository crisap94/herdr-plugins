import { compactionLine, compactionPiece, confirmationReads, unsupported } from '#src/recap/domain/compaction-plan.ts';
import type { CompactionPlanFactory, CompactionPlanResult } from '#src/recap/domain/compaction-plan.ts';
import { duration } from '#src/recap/domain/time.ts';
import { registeredKindOf } from '#src/recap/domain/registered-kinds.ts';
import type { RegisteredKind } from '#src/recap/domain/registered-kinds.ts';
import type { CompactionPlans } from '#src/ports/compaction-plans.ts';

const claude: CompactionPlanFactory = (guidance) => ({ kind: 'supported', plan: {
    lines: [compactionLine(compactionPiece('/compact '), compactionPiece(guidance))],
    enterDelay: duration(300),
    confirm: { kind: 'turn-end' },
    retryOnSelfFailure: true,
    followUp: { kind: 'none' },
} });

const polling: CompactionPlanFactory = (_guidance) => ({ kind: 'supported', plan: {
    lines: [compactionLine(compactionPiece('/compact'))],
    enterDelay: duration(300),
    confirm: { kind: 'poll', reads: confirmationReads(20), every: duration(1000) },
    retryOnSelfFailure: false,
    followUp: { kind: 'restore-message', acceptsStall: true },
} });

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
        return COMPACTION_PLANS[kind](guidance);
    },
};
