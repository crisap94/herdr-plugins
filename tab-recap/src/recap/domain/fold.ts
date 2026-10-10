import { lanesOf, put, removed, tabOfColumn, tabsWithLanes, without } from './board.ts';
import type { Board, HiddenState, Placement, Shape, Visibility, VisibilityTarget } from './board.ts';
import type { PaneId, TabId } from './ids.ts';
import type { Intent, RecapCause } from './intent.ts';
import { sessionId } from './ids.ts';
import { laneFrom, withStatus } from './lane.ts';
import type { Lane, SeenLane } from './lane.ts';
import { lingering, settle, spend, wantsKind } from './policy.ts';
import type { Policy } from './policy.ts';
import { endsTurn, laneStatus } from './status.ts';
import type { Instant } from './time.ts';
import { hiddenState, restoreHidden, withVisibility } from './visibility.ts';

export interface SeenColumn {
    readonly tabId: string;
    readonly paneId: string;
    readonly shape: Shape;
}

export interface Reconciliation {
    readonly focusedTab?: string | null;
    /** when the snapshot was REQUESTED (ms): one asked for before a column was opened cannot show it */
    readonly at?: number;
    readonly lanes: readonly SeenLane[];
    readonly panes: readonly string[];
    readonly columns: readonly SeenColumn[];
    readonly widths: ReadonlyMap<string, number>;
}

export type Observation =
    | { readonly kind: 'detected'; readonly lane: SeenLane }
    | { readonly kind: 'closed'; readonly pane: PaneId }
    | { readonly kind: 'status'; readonly pane: PaneId; readonly status: string }
    /** herdr reports the pane's agent session (a `pane.updated` frame): the lane follows it, a new agent's or a resumed one's */
    | { readonly kind: 'session'; readonly pane: PaneId; readonly session: string }
    | { readonly kind: 'reconciled'; readonly seen: Reconciliation }
    | { readonly kind: 'column-opened'; readonly tab: TabId; readonly pane: PaneId; readonly shape: Shape; readonly at?: number }
    | { readonly kind: 'column-failed'; readonly tab: TabId }
    | { readonly kind: 'focused'; readonly tab: TabId }
    | { readonly kind: 'requested'; readonly tab: TabId }
    | { readonly kind: 'switched'; readonly enabled: boolean }
    /** the operator hid or showed a column (or all of them) */
    | { readonly kind: 'visibility'; readonly target: VisibilityTarget; readonly hidden: Visibility }
    /** what was saved before the daemon started */
    | { readonly kind: 'hidden-restored'; readonly state: HiddenState };

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

const wanted = (seen: SeenLane, policy: Policy): boolean => wantsKind(policy, seen.agent);

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
    const fresh = laneFrom(seen);
    const lane = keepingSession(fresh, board.lanes.get(fresh.pane));
    const isNew = !board.lanes.has(lane.pane);
    const reads: Intent[] = isNew ? [{ kind: 'read-prompt', lane }] : [];
    return step({ ...board, lanes: put(board.lanes, lane.pane, lane) }, [{ kind: 'publish', tab: lane.tab }, ...reads], isNew);
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
    if (board.closing.has(pane)) {
        return step({ ...board, columns: without(board.columns, tab), closing: without(board.closing, pane) });
    }
    const [spent, intents] = spend({ ...board, columns: without(board.columns, tab) }, tab, now, policy);
    return step(spent, intents);
}

/**
 * A detection frame or a snapshot may carry no session (herdr reports it on the pane's frames): the lane keeps the one it held, but only for the same
 * agent. When the pane's agent changed, the held session is the old agent's, and the new one has not been named yet, so the lane holds none.
 */
function keepingSession(lane: Lane, held: Lane | undefined): Lane {
    return lane.session === null && held?.session && held.agent === lane.agent ? { ...lane, session: held.session } : lane;
}

/** herdr's session for a lane, as it reports it now: the board's lane follows, and nothing else changes (no intent, no watch set). */
function onSession(board: Board, pane: PaneId, session: string): Step {
    const lane = board.lanes.get(pane);
    if (lane === undefined || String(lane.session) === session) {
        return step(board);
    }
    return step({ ...board, lanes: put(board.lanes, pane, { ...lane, session: sessionId(session) }) });
}

function onStatus(board: Board, pane: PaneId, raw: string): Step {
    const lane = board.lanes.get(pane);
    const next = laneStatus(raw);
    if (lane === undefined || lane.status === next) {
        return step(board);
    }
    const after: Board = { ...board, lanes: put(board.lanes, pane, withStatus(lane, next)) };
    const ended = endsTurn(lane.status, next) ? recapsOf(after, [lane.tab], 'turn-ended') : [];
    return step(after, [{ kind: 'publish', tab: lane.tab }, { kind: 'read-prompt', lane: withStatus(lane, next) }, ...ended]);
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
function columnsAfter(board: Board, seen: Reconciliation): { readonly columns: ReadonlyMap<TabId, Placement>; readonly extras: readonly SeenColumn[] } {
    const alive = new Set(seen.panes);
    const agents = new Set(seen.lanes.map((lane) => lane.paneId));
    const columns = new Map([...board.columns].filter(([, placed]) => !agents.has(placed.pane) && (alive.has(placed.pane) || newerThan(placed, seen))));
    const extras: SeenColumn[] = [];
    for (const column of seen.columns.filter((seenColumn) => !agents.has(seenColumn.paneId))) {
        const tab = column.tabId as TabId;
        if (!columns.has(tab)) {
            columns.set(tab, { pane: column.paneId as PaneId, shape: column.shape });
        } else if (columns.get(tab)?.pane !== column.paneId && !board.opening.has(tab)) {
            extras.push(column);
        }
    }
    return { columns, extras };
}

/**
 * A column we opened after the snapshot was requested cannot be in it: its absence says nothing. (A snapshot is
 * folded after the opens that happened while it was on its way — the bug that opened a second column in a tab.)
 */
function newerThan(placed: Placement, seen: Reconciliation): boolean {
    return seen.at !== undefined && placed.since !== undefined && seen.at < placed.since;
}

function onReconciled(board: Board, seen: Reconciliation, now: Instant, policy: Policy): Step {
    const lanes = new Map<PaneId, Lane>();
    for (const raw of seen.lanes.filter((lane) => wanted(lane, policy))) {
        const fresh = laneFrom(raw);
        const lane = keepingSession(fresh, board.lanes.get(fresh.pane));
        lanes.set(lane.pane, lane);
    }
    const { columns, extras: found } = columnsAfter(board, seen);
    const extras = found.filter((extra) => !lingering(board, extra.paneId as PaneId, now, policy));
    const alive = new Set(seen.panes);
    let closing = new Map([...board.closing].filter(([pane]) => alive.has(pane)));
    for (const extra of extras) {
        closing = new Map(closing).set(extra.paneId as PaneId, now);
    }
    let opening = board.opening;
    for (const tab of columns.keys()) {
        opening = removed(opening, tab);
    }
    const widths = new Map([...seen.widths].map(([tab, width]) => [tab as TabId, width]));
    const focused = seen.focusedTab === undefined || seen.focusedTab === null ? board.focused : (seen.focusedTab as TabId);
    const next: Board = { ...board, lanes, columns, closing, opening, widths, focused, seeded: true };
    const sameSet = lanes.size === board.lanes.size && [...lanes.keys()].every((pane) => board.lanes.has(pane));
    const published: Intent[] = tabsWithLanes(next).map((tab) => ({ kind: 'publish', tab }));
    const reads: Intent[] = [...lanes.values()].filter((lane) => !board.lanes.has(lane.pane)).map((lane) => ({ kind: 'read-prompt', lane }));
    /** two of our columns in one tab (a leftover of a race, or of a close that did not happen): keep one, close the rest */
    const closes: Intent[] = extras.map((extra) => ({ kind: 'close-column', tab: extra.tabId as TabId, column: extra.paneId as PaneId }));
    return step(next, [...turnsEndedBetween(board, next), ...published, ...reads, ...closes], !sameSet);
}

function onColumnOpened(board: Board, tab: TabId, placed: Placement): Step {
    const next: Board = { ...board, columns: put(board.columns, tab, placed), opening: removed(board.opening, tab) };
    return step(next, [{ kind: 'publish', tab }]);
}

type Operator = Extract<Observation, { kind: 'focused' | 'requested' | 'switched' | 'visibility' | 'hidden-restored' }>;

/** What the operator did (or what they had saved): looking at a tab, asking for a recap, switching on/off, hiding or showing columns. */
function onOperator(board: Board, observation: Operator): Step {
    switch (observation.kind) {
        case 'focused':
            return step({ ...board, focused: observation.tab }, recapsOf(board, [observation.tab], 'focused'));
        case 'requested':
            return step(board, recapsOf(board, [observation.tab], 'requested'));
        case 'switched':
            return step({ ...board, enabled: observation.enabled });
        case 'hidden-restored':
            return step(restoreHidden(board, observation.state));
        case 'visibility': {
            const next = withVisibility(board, observation.target, observation.hidden);
            return step(next, [{ kind: 'save-hidden', state: hiddenState(next) }]);
        }
        default: {
            const exhaustive: never = observation;
            return step(board, [exhaustive]);
        }
    }
}

function route(board: Board, observation: Observation, now: Instant, policy: Policy): Step {
    switch (observation.kind) {
        case 'detected':
            return onDetected(board, observation.lane, policy);
        case 'closed':
            return onClosed(board, observation.pane, now, policy);
        case 'status':
            return onStatus(board, observation.pane, observation.status);
        case 'session':
            return onSession(board, observation.pane, observation.session);
        case 'reconciled':
            return onReconciled(board, observation.seen, now, policy);
        case 'column-opened':
            return onColumnOpened(board, observation.tab, { pane: observation.pane, shape: observation.shape, ...(observation.at === undefined ? {} : { since: observation.at }) });
        case 'column-failed': {
            const [spent, intents] = spend(board, observation.tab, now, policy);
            return step(spent, intents);
        }
        default:
            return onOperator(board, observation);
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

