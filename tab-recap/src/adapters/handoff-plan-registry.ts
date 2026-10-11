import { registeredKindOf } from '#src/recap/domain/registered-kinds.ts';
import type { RegisteredKind } from '#src/recap/domain/registered-kinds.ts';
import type { HandoffPlan, HandoffPlanResult, LocatedBy, SettleTime } from '#src/recap/domain/handoff-plan.ts';
import { duration } from '#src/recap/domain/time.ts';
import type { HandoffPlans } from '#src/ports/handoff-plans.ts';
import { supported, unsupportedCapability } from '#src/ports/capability.ts';
import type { Capability } from '#src/ports/capability.ts';

export const SETTLE_SOURCE = 'experiments/EXP-003-handoff-live/runs/R01-settle-and-handoff-proof/m4-trials.jsonl';

const settleOf = (after: number, trials: number): SettleTime => ({ after: duration(after), evidence: { trials, source: SETTLE_SOURCE } });

const promptPlan = (settle: SettleTime, locatedBy: LocatedBy): HandoffPlan => ({ delivery: 'prompt', evidence: 'either', retry: 'none', settle, locatedBy });

const HANDOFF_PLANS = {
    claude: supported(promptPlan(settleOf(10_000, 130), 'session')),
    codex: supported(promptPlan(settleOf(3_000, 130), 'directory')),
    opencode: supported(promptPlan(settleOf(60_000, 77), 'directory')),
    hermes: unsupportedCapability('no-plan'),
} satisfies Readonly<Record<RegisteredKind, Capability<HandoffPlan, 'no-plan'>>>;

export const handoffPlans: HandoffPlans = {
    forKind(rawKind: string): HandoffPlanResult {
        const kind = registeredKindOf(rawKind);
        if (kind === null) {
            return { kind: 'unsupported', reason: 'no-plan' };
        }
        const capability = HANDOFF_PLANS[kind];
        return capability.kind === 'supported' ? { kind: 'supported', plan: capability.value } : { kind: 'unsupported', reason: capability.why };
    },
};
