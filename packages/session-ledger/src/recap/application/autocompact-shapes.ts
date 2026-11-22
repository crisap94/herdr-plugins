import type { LastDecisionRow, DecisionMode } from '#src/ports/autocompact-records.ts';
import type { AutocompactPolicy, Gate } from '#src/recap/domain/autocompact.ts';
import { must } from '#src/protocol/result.ts';
import type { CompactTuning } from '#src/recap/domain/autocompact-style.ts';
import type { ContextUse } from '#src/recap/domain/compaction.ts';
import type { Count } from '#src/recap/domain/count.ts';
import { shareOf } from '#src/recap/domain/compaction.ts';
import type { Flight } from '#src/recap/domain/in-flight.ts';
import type { AgentKind, Placement } from '#src/recap/domain/timing-ids.ts';
import { registeredKindOf } from '#src/recap/domain/registered-kinds.ts';
import type { Text } from '#src/recap/domain/text.ts';
import { parseMilliseconds, type Instant, type Milliseconds } from '#src/recap/domain/time.ts';
import type { Busy, BusyDetail, CeilingReach, Recheck } from './autocompact-gates.ts';
import type { Effect } from './autocompact-line.ts';
import { textOf } from '#src/recap/domain/text.ts';

export type CoverageHold = 'backing-off' | 'open';
export type Asking = 'asks' | 'holds';
export type DeciderHealth = 'reachable' | 'unreachable';

export interface Stop {
    readonly gate: Gate;
    readonly effect: Effect;
    readonly detail: Text | null;
    readonly recheck: Recheck;
    readonly flight: Flight;
    readonly atCeiling: CeilingReach;
}

export interface Marks {
    readonly last: LastDecisionRow | null;
    readonly lastBreakAt: Instant | null;
    readonly lastDecisionAt: Instant | null;
}

export interface LanePolicy extends Omit<AutocompactPolicy, 'mode'> {
    readonly mode: DecisionMode;
}

export function policyForLane(policy: AutocompactPolicy, agent: AgentKind): LanePolicy | null {
    if (policy.mode === 'off') return null;
    const registered = registeredKindOf(textOf(agent));
    const shadowed = registered !== null && policy.shadowKinds.includes(registered);
    return { ...policy, mode: shadowed ? 'shadow' : policy.mode };
}

export function reachOf(use: ContextUse, policy: AutocompactPolicy): CeilingReach {
    return shareOf(use) >= policy.ceiling ? 'at-ceiling' : 'below-ceiling';
}

export function busyDetailOf(busy: Busy): BusyDetail | null {
    return busy.kind === 'busy' ? busy.detail : null;
}

export function idleMsOf(tuning: CompactTuning): Milliseconds | null {
    return tuning.recheckIdleMs === null ? null : must(parseMilliseconds(tuning.recheckIdleMs));
}

export interface BackoffFacts {
    readonly policy: AutocompactPolicy;
    readonly last: LastDecisionRow | null;
    readonly now: Instant;
    readonly tokens: Count;
    readonly window: Count;
    readonly lastBreakAt: Instant | null;
}

export function coverageBackoffActive(input: BackoffFacts): CoverageHold {
    const { policy, last, now, tokens, window, lastBreakAt } = input;
    if (policy.coverageBackoff.kind !== 'window' || last === null) return 'open';
    return last.gate === 'coverage' && last.verdict === 'wait' && now - last.at < policy.coverageBackoff.ms && tokens - last.tokens <= window * 0.1 && (lastBreakAt === null || lastBreakAt <= last.at) ? 'backing-off' : 'open';
}

export type Eligibility = 'eligible' | 'ineligible';

export function idleEligibility(policy: LanePolicy | null, placed: Placement, use: ContextUse | null): Eligibility {
    return policy === null || policy.mode !== 'on' || !placed.candidate.ready || !policy.kinds.includes(placed.agent) || use === null || shareOf(use) < policy.minimum ? 'ineligible' : 'eligible';
}
