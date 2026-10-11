import type { AgentKind, PaneId, TabId } from './ids.ts';
import type { Lane } from './lane.ts';
import type { Instant } from './time.ts';

export interface ClosedLaneIdentity {
    readonly tab: TabId;
    readonly pane: PaneId;
    readonly closedAt: Instant;
}

export interface ClosedLane {
    readonly tab: TabId;
    readonly pane: PaneId;
    readonly agent: AgentKind;
    readonly since: Instant | null;
    readonly cwd: Lane['cwd'];
    readonly closedAt: Instant;
}

export interface RestoredLane {
    readonly tab: TabId;
    readonly pane: PaneId;
    readonly agent: AgentKind;
    readonly since: Instant | null;
    readonly cwd: Lane['cwd'];
}

type Incarnation = Pick<ClosedLane, 'tab' | 'pane' | 'agent' | 'since' | 'cwd'>;

export function closureOf(lane: Incarnation, closedAt: Instant): ClosedLane {
    return { tab: lane.tab, pane: lane.pane, agent: lane.agent, since: lane.since, cwd: lane.cwd, closedAt };
}

const keeps = (after: ReadonlyMap<PaneId, Lane>, prior: Pick<Incarnation, 'pane' | 'agent'>): boolean =>
    after.get(prior.pane)?.agent === prior.agent;

export function closuresBetween(
    before: ReadonlyMap<PaneId, Lane>,
    after: ReadonlyMap<PaneId, Lane>,
    persisted: readonly RestoredLane[],
    now: Instant,
): readonly ClosedLane[] {
    const held = [...before.values()].filter((lane) => !keeps(after, lane));
    const restored = persisted.filter((lane) => !before.has(lane.pane) && !keeps(after, lane));
    return [...held, ...restored].map((lane) => closureOf(lane, now));
}
