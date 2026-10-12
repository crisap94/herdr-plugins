import type { LastDecision, DecisionMode } from '#src/ports/autocompact-records.ts';
import type { AutocompactPolicy, Gate } from '#src/recap/domain/autocompact.ts';
import { milliseconds } from '#src/recap/domain/autocompact.ts';
import type { AutocompactTuning } from '#src/recap/domain/autocompact-style.ts';
import type { ContextUse } from '#src/recap/domain/compaction.ts';
import { shareOf } from '#src/recap/domain/compaction.ts';
import type { Flight } from '#src/recap/domain/in-flight.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import { registeredKindOf } from '#src/recap/domain/registered-kinds.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Instant, Milliseconds } from '#src/recap/domain/time.ts';
import type { Busy, BusyDetail, CeilingReach, Recheck } from './autocompact-gates.ts';
import type { Effect } from './autocompact-line.ts';

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
    readonly last: LastDecision | null;
    readonly lastBreakAt: Instant | null;
    readonly lastDecisionAt: Instant | null;
}

export interface LanePolicy extends Omit<AutocompactPolicy, 'mode'> {
    readonly mode: DecisionMode;
}

export function policyForLane(policy: AutocompactPolicy, lane: Lane): LanePolicy | null {
    if (policy.mode === 'off') return null;
    const registered = registeredKindOf(lane.agent);
    const shadowed = registered !== null && policy.shadowKinds.includes(registered);
    return { ...policy, mode: shadowed ? 'shadow' : policy.mode };
}

export function reachOf(use: ContextUse, policy: AutocompactPolicy): CeilingReach {
    return shareOf(use) >= policy.ceiling ? 'at-ceiling' : 'below-ceiling';
}

export function busyDetailOf(busy: Busy): BusyDetail | null {
    return busy.kind === 'busy' ? busy.detail : null;
}

export function idleMsOf(tuning: AutocompactTuning): Milliseconds | null {
    return tuning.recheckIdleMs === null ? null : milliseconds(tuning.recheckIdleMs);
}
