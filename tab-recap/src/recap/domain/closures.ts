import type { HarnessKind, SessionKey, ScopeId } from './ids.ts';
import type { Directory } from '@stateforge-labs/session-ledger';
import type { FollowedSession } from './lane.ts';
import type { Instant } from '@stateforge-labs/session-ledger';

export interface ClosedLaneIdentity {
    readonly tab: ScopeId;
    readonly pane: SessionKey;
    readonly closedAt: Instant;
}

export interface ClosedLane {
    readonly tab: ScopeId;
    readonly pane: SessionKey;
    readonly agent: HarnessKind;
    readonly since: Instant | null;
    readonly cwd: Directory | null;
    readonly closedAt: Instant;
}

export interface RestoredLane {
    readonly tab: ScopeId;
    readonly pane: SessionKey;
    readonly agent: HarnessKind;
    readonly since: Instant | null;
    readonly cwd: Directory | null;
}

type Incarnation = Pick<ClosedLane, 'tab' | 'pane' | 'agent' | 'since' | 'cwd'>;

export function closureOf(lane: Incarnation, closedAt: Instant): ClosedLane {
    return { tab: lane.tab, pane: lane.pane, agent: lane.agent, since: lane.since, cwd: lane.cwd, closedAt };
}

export function incarnating(lane: FollowedSession, prior: Pick<FollowedSession, 'agent' | 'since'> | undefined, now: Instant): FollowedSession {
    return { ...lane, since: prior !== undefined && prior.agent === lane.agent ? prior.since : now };
}

export type Kept = 'kept' | 'gone';

const keeps = (after: ReadonlyMap<SessionKey, FollowedSession>, prior: Pick<Incarnation, 'pane' | 'agent'>): Kept =>
    after.get(prior.pane)?.agent === prior.agent ? 'kept' : 'gone';

export function closuresBetween(
    before: ReadonlyMap<SessionKey, FollowedSession>,
    after: ReadonlyMap<SessionKey, FollowedSession>,
    persisted: readonly RestoredLane[],
    now: Instant,
): readonly ClosedLane[] {
    const held = [...before.values()].filter((lane) => keeps(after, lane) === 'gone');
    const restored = persisted.filter((lane) => !before.has(lane.pane) && keeps(after, lane) === 'gone');
    return [...held, ...restored].map((lane) => closureOf(lane, now));
}
