import { compactCommand } from '@stateforge-labs/harness-adapters';
import { compactionLine, compactionPiece, confirmationReads, needsIdle, QUEUES, unsupported } from '#src/recap/domain/compaction-plan.ts';
import type { CompactionPlanFactory, CompactionPlanResult } from '#src/recap/domain/compaction-plan.ts';
import { duration } from '#src/recap/domain/time.ts';
import { registeredKindOf } from '#src/recap/domain/registered-kinds.ts';
import type { RegisteredKind } from '#src/recap/domain/registered-kinds.ts';
import type { CompactionPlans } from '#src/ports/compaction-plans.ts';
import { supported } from '#src/ports/capability.ts';
import type { Capability } from '#src/ports/capability.ts';
import type { CompactionWhy } from '#src/ports/capability-reasons.ts';
import { capabilityWording } from '#src/ports/capability-reasons.ts';

type HarnessKind = Parameters<typeof compactCommand>[0];

const claude: CompactionPlanFactory = (guidance) => ({ kind: 'supported', plan: {
    lines: [compactionLine(compactionPiece(`${compactCommand('claude')} `), compactionPiece(guidance))],
    enterDelay: duration(300),
    confirm: { kind: 'turn-end' },
    retryOnSelfFailure: true,
    followUp: { kind: 'none' },
    whileWorking: QUEUES,
} });

const polling = (harness: HarnessKind): CompactionPlanFactory => (_guidance) => ({ kind: 'supported', plan: {
    lines: [compactionLine(compactionPiece(compactCommand(harness)))],
    enterDelay: duration(300),
    confirm: { kind: 'poll', reads: confirmationReads(20), every: duration(1000) },
    retryOnSelfFailure: false,
    followUp: { kind: 'restore-message', acceptsStall: true },
    whileWorking: needsIdle('queued input is not measured for this kind'),
} });

export const COMPACTION_PLANS = {
    claude: supported(claude),
    codex: supported(polling('codex')),
    opencode: supported(polling('opencode')),
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
