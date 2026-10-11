import { READY } from '#src/recap/domain/status.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import type { PaneId } from '#src/recap/domain/ids.ts';
import type { HandoffOutcome } from '#src/recap/domain/handoff-outcome.ts';
import type { HandoffPlan } from '#src/recap/domain/handoff-plan.ts';
import type { HandoffPlans } from '#src/ports/handoff-plans.ts';
import type { InFlight } from '#src/ports/in-flight.ts';
import type { Waiting } from './autocompact.ts';

export type TargetRefusal = Extract<HandoffOutcome, { readonly kind: 'refused'; readonly reason: 'source-equals-target' | 'not-a-lane' | 'status-not-ready' | 'in-flight' }>;

export type ReadinessRefusal = Extract<HandoffOutcome, { readonly kind: 'refused'; readonly reason: 'status-not-ready' | 'in-flight' }>;

export type Unsupported = Extract<HandoffOutcome, { readonly kind: 'unsupported' }>;

export type Readiness = { readonly kind: 'ready'; readonly ownTranscript: boolean } | ReadinessRefusal;

export interface Ready {
    readonly kind: 'ready';
    readonly lane: Lane;
    readonly plan: HandoffPlan;
    readonly ownTranscript: boolean;
}

export type TargetResolution = Ready | TargetRefusal | Unsupported;

export interface TargetDeps {
    readonly lanes: readonly Lane[];
    readonly plans: HandoffPlans;
    readonly inFlight: InFlight;
    readonly awaiting: (pane: string) => Promise<Waiting>;
}

const keyOf = (plan: HandoffPlan, lane: Lane): string | null => (plan.locatedBy === 'session' ? lane.session : lane.cwd);

function ownTranscriptOf(lanes: readonly Lane[], lane: Lane, plan: HandoffPlan): boolean {
    const key = keyOf(plan, lane);
    return key !== null && !lanes.some((other) => other.pane !== lane.pane && other.agent === lane.agent && keyOf(plan, other) === key);
}

async function nothingInFlight(port: InFlight, lane: Lane): Promise<boolean> {
    const reading = await port.read(lane);
    return reading.kind === 'not-started' || (reading.kind === 'count' && reading.count === 0);
}

export async function readinessOf(lane: Lane, plan: HandoffPlan, deps: Pick<TargetDeps, 'lanes' | 'inFlight' | 'awaiting'>): Promise<Readiness> {
    if (!READY.has(lane.status)) {
        return { kind: 'refused', reason: 'status-not-ready' };
    }
    if ((await deps.awaiting(String(lane.pane))).kind !== 'clear') {
        return { kind: 'refused', reason: 'in-flight' };
    }
    const ownTranscript = ownTranscriptOf(deps.lanes, lane, plan);
    if (ownTranscript && !(await nothingInFlight(deps.inFlight, lane))) {
        return { kind: 'refused', reason: 'in-flight' };
    }
    return { kind: 'ready', ownTranscript };
}

export async function resolveTarget(source: PaneId | null, target: PaneId, deps: TargetDeps): Promise<TargetResolution> {
    if (source !== null && source === target) {
        return { kind: 'refused', reason: 'source-equals-target' };
    }
    const lane = deps.lanes.find((each) => each.pane === target);
    if (lane === undefined) {
        return { kind: 'refused', reason: 'not-a-lane' };
    }
    const found = deps.plans.forKind(String(lane.agent));
    if (found.kind === 'unsupported') {
        return found;
    }
    const readiness = await readinessOf(lane, found.plan, deps);
    return readiness.kind === 'ready' ? { ...readiness, lane, plan: found.plan } : readiness;
}
