import { registeredKindOf } from '#src/recap/domain/registered-kinds.ts';
import type { RegisteredKind } from '#src/recap/domain/registered-kinds.ts';
import type { HandoffPlan, HandoffPlanResult, LocatedBy, SettleTime } from '#src/recap/domain/handoff-plan.ts';
import type { AgentKind } from '#src/recap/domain/ids.ts';
import { must } from '#src/protocol/result.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import { duration } from '#src/recap/domain/time.ts';
import type { Duration } from '#src/recap/domain/time.ts';
import type { Count } from '#src/recap/domain/count.ts';
import type { HandoffPlanCatalogue } from '#src/ports/handoff-plans.ts';
import { supported } from '#src/ports/capability.ts';
import type { Support } from '#src/ports/capability.ts';
import { textOf } from '#src/recap/domain/text.ts';

export const SETTLE_SOURCE = 'experiments/EXP-003-handoff-live/runs/R01-settle-and-handoff-proof/m4-trials.jsonl';

const settleOf = (after: Duration, trials: Count): SettleTime => ({ after, evidence: { trials, source: textOf(SETTLE_SOURCE) } });

const promptPlan = (settle: SettleTime, locatedBy: LocatedBy): HandoffPlan => ({ delivery: 'prompt', evidence: 'either', retry: 'none', settle, locatedBy });

const HANDOFF_PLANS = {
    claude: supported(promptPlan(settleOf(duration(10_000), must(parseCount(130))), 'session')),
    codex: supported(promptPlan(settleOf(duration(3_000), must(parseCount(130))), 'directory')),
    opencode: supported(promptPlan(settleOf(duration(60_000), must(parseCount(77))), 'directory')),
} satisfies Readonly<Record<RegisteredKind, Support<HandoffPlan, 'no-plan'>>>;

export const handoffPlanner: HandoffPlanCatalogue = {
    forKind(kind: AgentKind): HandoffPlanResult {
        const registered = registeredKindOf(textOf(kind));
        if (registered === null) {
            return { kind: 'unsupported', reason: 'no-plan' };
        }
        const capability = HANDOFF_PLANS[registered];
        return capability.kind === 'supported' ? { kind: 'supported', plan: capability.value } : { kind: 'unsupported', reason: capability.why };
    },
};
