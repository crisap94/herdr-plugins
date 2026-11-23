import { compactCommand } from '@stateforge-labs/harness-adapters';
import { acceptsStall, compactionLine, needsIdle, retriesOnSelfFailure, parseCompactionPiece, parseConfirmationReads, QUEUES, unsupported } from '#src/recap/domain/compaction-plan.ts';
import type { CompactionPlanResult } from '#src/recap/domain/compaction-plan.ts';
import { duration } from '#src/recap/domain/time.ts';
import { registeredKindOf } from '#src/recap/domain/registered-kinds.ts';
import type { RegisteredKind } from '#src/recap/domain/registered-kinds.ts';
import type { AgentKind } from '#src/recap/domain/ids.ts';
import { parseText, type Text, textOf } from '#src/recap/domain/text.ts';
import type { CompactionPlanner } from '#src/ports/compaction-plans.ts';
import { supported } from '#src/ports/capability.ts';
import type { Support } from '#src/ports/capability.ts';
import type { CompactionWhy } from '#src/ports/capability-reasons.ts';
import { capabilityWording } from '#src/ports/capability-reasons.ts';
import { must } from '#src/protocol/result.ts';

type HarnessKind = Parameters<typeof compactCommand>[0];
type PlanFor = (guidance: Text) => CompactionPlanResult;

const claude = (guidance: Text): CompactionPlanResult => ({ kind: 'supported', plan: {
    lines: [compactionLine(must(parseCompactionPiece(`${compactCommand('claude')} `)), must(parseCompactionPiece(guidance)))],
    enterDelay: duration(300),
    confirm: { kind: 'turn-end' },
    retryOnSelfFailure: retriesOnSelfFailure(true),
    followUp: { kind: 'none' },
    whileWorking: QUEUES,
} });

const polling = (harness: HarnessKind): PlanFor => (_guidance: Text): CompactionPlanResult => ({ kind: 'supported', plan: {
    lines: [compactionLine(must(parseCompactionPiece(compactCommand(harness))))],
    enterDelay: duration(300),
    confirm: { kind: 'poll', reads: must(parseConfirmationReads(20)), every: duration(1000) },
    retryOnSelfFailure: retriesOnSelfFailure(false),
    followUp: { kind: 'restore-message', acceptsStall: acceptsStall(true) },
    whileWorking: needsIdle(textOf('queued input is not measured for this kind')),
} });

export const COMPACTION_PLANS = {
    claude: supported(claude),
    codex: supported(polling('codex')),
    opencode: supported(polling('opencode')),
} satisfies Readonly<Record<RegisteredKind, Support<PlanFor, CompactionWhy>>>;

export const compactionPlanner: CompactionPlanner = {
    forKind(kind: AgentKind, guidance: Text): CompactionPlanResult {
        const registered = registeredKindOf(textOf(kind));
        if (registered === null) {
            return unsupported(capabilityWording('compaction-unavailable', must(parseText(kind))));
        }
        const capability = COMPACTION_PLANS[registered];
        return capability.kind === 'supported'
            ? capability.value(guidance)
            : unsupported(capabilityWording(capability.why, must(parseText(kind))));
    },
};
