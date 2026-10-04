import { lanesOf, put, removed, tabOfColumn, tabsWithLanes, without } from './board.ts';
import type { Board, Placement, Shape } from './board.ts';
import type { PaneId, TabId } from './ids.ts';
import type { Intent, RecapCause } from './intent.ts';
import { laneFrom, withStatus } from './lane.ts';
import type { Lane, SeenLane } from './lane.ts';
import { settle, spend } from './policy.ts';
import type { Policy } from './policy.ts';
import { endsTurn, laneStatus } from './status.ts';
import type { Instant } from './time.ts';

export interface SeenColumn {
    readonly tabId: string;
    readonly paneId: string;
    readonly shape: Shape;
}

export interface Reconciliation {
    readonly focusedTab?: string | null;
    readonly lanes: readonly SeenLane[];
    readonly panes: readonly string[];
    readonly columns: readonly SeenColumn[];
    readonly widths: ReadonlyMap<string, number>;
}

export type Observation =
    | { readonly kind: 'detected'; readonly lane: SeenLane }
    | { readonly kind: 'closed'; readonly pane: PaneId }
    | { readonly kind: 'status'; readonly pane: PaneId; readonly status: string }
    | { readonly kind: 'reconciled'; readonly seen: Reconciliation }
    | { readonly kind: 'column-opened'; readonly tab: TabId; readonly pane: PaneId; readonly shape: Shape }
    | { readonly kind: 'column-failed'; readonly tab: TabId }
    | { readonly kind: 'focused'; readonly tab: TabId }
    | { readonly kind: 'requested'; readonly tab: TabId }
    | { readonly kind: 'switched'; readonly enabled: boolean };

export interface Outcome {
    readonly board: Board;
    readonly intents: readonly Intent[];
    readonly watchSet: 'unchanged' | 'changed';
}

interface Step {
    readonly board: Board;
    readonly intents: readonly Intent[];
    readonly changed: boolean;
}

const step = (board: Board, intents: readonly Intent[] = [], changed = false): Step => ({ board, intents, changed });

const wanted = (seen: SeenLane, policy: Policy): boolean => policy.kinds.includes(seen.agent);

/** One recap intent per tab, carrying every lane of that tab. */
function recapsOf(board: Board, tabs: readonly TabId[], cause: RecapCause): readonly Intent[] {
    return [...new Set(tabs)]
        .map((tab) => ({ tab, lanes: lanesOf(board, tab) }))
        .filter(({ lanes }) => lanes.length > 0)
        .map(({ tab, lanes }) => ({ kind: 'recap', tab, lanes, cause }));
}

/** An agent appeared in a pane the board held as a column: it is a lane now, and no column. */
function withoutColumnAt(board: Board, pane: string): Board {
    const columns = new Map([...board.columns].filter(([, placed]) => String(placed.pane) !== pane));
    return columns.size === board.columns.size ? board : { ...board, columns };
}

function onDetected(held: Board, seen: SeenLane, policy: Policy): Step {
    const board = withoutColumnAt(held, seen.paneId);
    if (!wanted(seen, policy)) {
        return step(board);
    }
    const lane = laneFrom(seen);
    const isNew = !board.lanes.has(lane.pane);
    return step({ ...board, lanes: put(board.lanes, lane.pane, lane) }, [{ kind: 'publish', tab: lane.tab }], isNew);
}

function onClosed(board: Board, pane: PaneId, now: Instant, policy: Policy): Step {
    const lane = board.lanes.get(pane);
    if (lane !== undefined) {
        return step({ ...board, lanes: without(board.lanes, pane) }, [{ kind: 'publish', tab: lane.tab }], true);
    }
    const tab = tabOfColumn(board, pane);
    if (tab === null) {
        return step(board);
    }
    const [spent, intents] = spend({ ...board, columns: without(board.columns, tab) }, tab, now, policy);
    return step(spent, intents);
}

function onStatus(board: Board, pane: PaneId, raw: string): Step {
    const lane = board.lanes.get(pane);
    const next = laneStatus(raw);
    if (lane === undefined || lane.status === next) {
        return step(board);
    }
    const after: Board = { ...board, lanes: put(board.lanes, pane, withStatus(lane, next)) };
    const ended = endsTurn(lane.status, next) ? recapsOf(after, [lane.tab], 'turn-ended') : [];
    return step(after, [{ kind: 'publish', tab: lane.tab }, ...ended]);
}

function turnsEndedBetween(before: Board, after: Board): readonly Intent[] {
    const tabs: TabId[] = [];
    for (const [pane, lane] of after.lanes) {
        const prior = before.lanes.get(pane);
        if (prior !== undefined && endsTurn(prior.status, lane.status)) {
            tabs.push(lane.tab);
        }
    }
    return recapsOf(after, tabs, 'turn-ended');
}

/**
 * A pane that hosts an agent is never a column, whatever it is called (any agent kind, not only the
 * ones we write recaps about): the board drops it if it had taken it for one, and never adopts it.
 */
function columnsAfter(board: Board, seen: Reconciliation): ReadonlyMap<TabId, Placement> {
    const alive = new Set(seen.panes);
    const agents = new Set(seen.lanes.map((lane) => lane.paneId));
    const columns = new Map([...board.columns].filter(([, placed]) => alive.has(placed.pane) && !agents.has(placed.pane)));
    for (const column of seen.columns.filter((seenColumn) => !agents.has(seenColumn.paneId))) {
        const tab = column.tabId as TabId;
        if (!columns.has(tab)) {
            columns.set(tab, { pane: column.paneId as PaneId, shape: column.shape });
        }
    }
    return columns;
}

function onReconciled(board: Board, seen: Reconciliation, policy: Policy): Step {
    const lanes = new Map<PaneId, Lane>();
    for (const raw of seen.lanes.filter((lane) => wanted(lane, policy))) {
        const lane = laneFrom(raw);
        lanes.set(lane.pane, lane);
    }
    const columns = columnsAfter(board, seen);
    let opening = board.opening;
    for (const tab of columns.keys()) {
        opening = removed(opening, tab);
    }
    const widths = new Map([...seen.widths].map(([tab, width]) => [tab as TabId, width]));
    const focused = seen.focusedTab === undefined || seen.focusedTab === null ? board.focused : (seen.focusedTab as TabId);
    const next: Board = { ...board, lanes, columns, opening, widths, focused, seeded: true };
    const sameSet = lanes.size === board.lanes.size && [...lanes.keys()].every((pane) => board.lanes.has(pane));
    const published: Intent[] = tabsWithLanes(next).map((tab) => ({ kind: 'publish', tab }));
    return step(next, [...turnsEndedBetween(board, next), ...published], !sameSet);
}

function onColumnOpened(board: Board, tab: TabId, placed: Placement): Step {
    const next: Board = { ...board, columns: put(board.columns, tab, placed), opening: removed(board.opening, tab) };
    return step(next, [{ kind: 'publish', tab }]);
}

function route(board: Board, observation: Observation, now: Instant, policy: Policy): Step {
    switch (observation.kind) {
        case 'detected':
            return onDetected(board, observation.lane, policy);
        case 'closed':
            return onClosed(board, observation.pane, now, policy);
        case 'status':
            return onStatus(board, observation.pane, observation.status);
        case 'reconciled':
            return onReconciled(board, observation.seen, policy);
        case 'column-opened':
            return onColumnOpened(board, observation.tab, { pane: observation.pane, shape: observation.shape });
        case 'column-failed': {
            const [spent, intents] = spend(board, observation.tab, now, policy);
            return step(spent, intents);
        }
        case 'focused':
            return step({ ...board, focused: observation.tab }, recapsOf(board, [observation.tab], 'focused'));
        case 'requested':
            return step(board, recapsOf(board, [observation.tab], 'requested'));
        case 'switched':
            return step({ ...board, enabled: observation.enabled });
        default: {
            const exhaustive: never = observation;
            return step(board, [exhaustive]);
        }
    }
}

/** The last line of defence: no close-column intent ever names a pane the board knows as a lane. */
function closesLane(intent: Intent, ...boards: readonly Board[]): boolean {
    return intent.kind === 'close-column' && boards.some((board) => board.lanes.has(intent.column));
}

/** The whole domain: (board, observation, instant) → (board, intents). No I/O, no text. */
export function observe(board: Board, observation: Observation, now: Instant, policy: Policy): Outcome {
    const routed = route(board, observation, now, policy);
    const [settled, columnIntents] = settle(routed.board, now, policy);
    return {
        board: settled,
        intents: [...routed.intents, ...columnIntents].filter((intent) => !closesLane(intent, board, routed.board)),
        watchSet: routed.changed ? 'changed' : 'unchanged',
    };
}

