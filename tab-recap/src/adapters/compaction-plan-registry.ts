import { compactionLine, compactionPiece, confirmationReads, unsupported } from '#src/recap/domain/compaction-plan.ts';
import type { CompactionPlanFactory, CompactionPlanResult } from '#src/recap/domain/compaction-plan.ts';
import { duration } from '#src/recap/domain/time.ts';
import { registeredKindOf } from '#src/recap/domain/registered-kinds.ts';
import type { RegisteredKind } from '#src/recap/domain/registered-kinds.ts';
import type { CompactionPlans } from '#src/ports/compaction-plans.ts';
import { supported, unsupportedCapability } from '#src/ports/capability.ts';
import type { Capability } from '#src/ports/capability.ts';
import type { CompactionWhy } from '#src/ports/capability-reasons.ts';
import { capabilityWording } from '#src/ports/capability-reasons.ts';

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
    claude: supported(claude),
    codex: supported(polling),
    opencode: supported(polling),
    hermes: unsupportedCapability('compaction-unavailable'),
} satisfies Readonly<Record<RegisteredKind, Capability<CompactionPlanFactory, CompactionWhy>>>;

export const compactionPlans: CompactionPlans = {
    forKind(rawKind: string, guidance: string): CompactionPlanResult {
        const kind = registeredKindOf(rawKind);
        if (kind === null) {
            return unsupported(capabilityWording('compaction-unavailable', rawKind));
        }
        const capability = COMPACTION_PLANS[kind];
        return capability.kind === 'supported'
            ? capability.value(guidance)
            : unsupported(capabilityWording(capability.why, rawKind));
    },
};
