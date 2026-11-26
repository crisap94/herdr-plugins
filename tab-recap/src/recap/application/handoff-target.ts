import { READY } from '#src/recap/domain/status.ts';
import type { FollowedSession } from '#src/recap/domain/lane.ts';
import type { SessionKey } from '#src/recap/domain/ids.ts';
import type { HandoffOutcome } from '#src/recap/domain/handoff-outcome.ts';
import type { HandoffPlan } from '#src/recap/domain/handoff-plan.ts';
import type { HandoffPlanCatalogue } from '#src/ports/handoff-plans.ts';
import type { InFlightReader } from '#src/ports/in-flight.ts';
import type { Waiting } from '@stateforge-labs/session-ledger';
import { textOf, type Text } from '@stateforge-labs/session-ledger';

export type TargetRefusal = Extract<HandoffOutcome, { readonly kind: 'refused'; readonly reason: 'source-equals-target' | 'not-a-lane' | 'status-not-ready' | 'in-flight' }>;

export type ReadinessRefusal = Extract<HandoffOutcome, { readonly kind: 'refused'; readonly reason: 'status-not-ready' | 'in-flight' }>;

export type Unsupported = Extract<HandoffOutcome, { readonly kind: 'unsupported' }>;

export type Readiness = { readonly kind: 'ready'; readonly transcript: TranscriptHold } | ReadinessRefusal;

export interface Ready {
    readonly kind: 'ready';
    readonly lane: FollowedSession;
    readonly plan: HandoffPlan;
    readonly transcript: TranscriptHold;
}

export type TargetResolution = Ready | TargetRefusal | Unsupported;

export interface TargetDeps {
    readonly lanes: readonly FollowedSession[];
    readonly plans: HandoffPlanCatalogue;
    readonly inFlight: InFlightReader;
    readonly awaiting: (pane: SessionKey) => Promise<Waiting>;
}

export type TranscriptHold = 'own' | 'shared';

type Flight = 'idle' | 'busy';

function keyOf(plan: HandoffPlan, lane: FollowedSession): Text | null {
    const key = plan.locatedBy === 'session' ? lane.session : lane.cwd;
    return key === null ? null : textOf(key);
}

function ownTranscriptOf(lanes: readonly FollowedSession[], lane: FollowedSession, plan: HandoffPlan): TranscriptHold {
    const key = keyOf(plan, lane);
    return key !== null && !lanes.some((other) => other.pane !== lane.pane && other.agent === lane.agent && keyOf(plan, other) === key) ? 'own' : 'shared';
}

async function flightOf(port: InFlightReader, lane: FollowedSession): Promise<Flight> {
    const reading = await port.read(lane);
    return reading.kind === 'not-started' || (reading.kind === 'count' && reading.count === 0) ? 'idle' : 'busy';
}

export async function readinessOf(lane: FollowedSession, plan: HandoffPlan, deps: Pick<TargetDeps, 'lanes' | 'inFlight' | 'awaiting'>): Promise<Readiness> {
    if (!READY.has(lane.status)) {
        return { kind: 'refused', reason: 'status-not-ready' };
    }
    if ((await deps.awaiting(lane.pane)).kind !== 'clear') {
        return { kind: 'refused', reason: 'in-flight' };
    }
    const hold = ownTranscriptOf(deps.lanes, lane, plan);
    if (hold === 'own' && (await flightOf(deps.inFlight, lane)) === 'busy') {
        return { kind: 'refused', reason: 'in-flight' };
    }
    return { kind: 'ready', transcript: hold };
}

export async function resolveTarget(source: SessionKey | null, target: SessionKey, deps: TargetDeps): Promise<TargetResolution> {
    if (source !== null && source === target) {
        return { kind: 'refused', reason: 'source-equals-target' };
    }
    const lane = deps.lanes.find((each) => each.pane === target);
    if (lane === undefined) {
        return { kind: 'refused', reason: 'not-a-lane' };
    }
    const found = deps.plans.forKind(lane.agent);
    if (found.kind === 'unsupported') {
        return found;
    }
    const readiness = await readinessOf(lane, found.plan, deps);
    return readiness.kind === 'ready' ? { ...readiness, lane, plan: found.plan } : readiness;
}
