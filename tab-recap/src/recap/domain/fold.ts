import { must } from '@stateforge-labs/session-ledger';
import { textOf } from '@stateforge-labs/session-ledger';
import type { Count } from '@stateforge-labs/session-ledger';
import { lanesOf, seededOf, put, removed, tabOfColumn, tabsWithLanes, without } from './board.ts';
import type { Board, HiddenState, Placement, Visibility, VisibilityTarget } from './board.ts';
import { closureOf, closuresBetween, incarnating } from './closures.ts';
import type { ClosedLane, RestoredLane } from './closures.ts';
import { deadColumnsAfter } from './dead-columns.ts';
import type { SessionKey, ScopeId } from './ids.ts';
import type { Intent, RecapCause } from './intent.ts';
import { parsePaneId, parseTabId, parseSessionId } from './ids.ts';
import type { ColumnOpenedObservation, Reconciliation, SessionObservation, StatusObservation, SwitchedObservation } from './seen.ts';
import { laneFrom, withStatus } from './lane.ts';
import type { FollowedSession, SeenLane } from './lane.ts';
import { lingering, settle, spend, wantsKind } from './policy.ts';
import type { Policy } from './policy.ts';
import { endsTurn, laneStatus } from './status.ts';
import type { Instant } from '@stateforge-labs/session-ledger';
import { hiddenState, restoreHidden, withVisibility } from './visibility.ts';

export interface RestoredObservation {
    readonly kind: 'restored';
    readonly lanes: readonly RestoredLane[];
}

export interface DetectedObservation { readonly kind: 'detected'; readonly lane: SeenLane }
export interface ClosedObservation { readonly kind: 'closed'; readonly pane: SessionKey }
export interface ReconciledObservation { readonly kind: 'reconciled'; readonly seen: Reconciliation }
export interface ColumnFailedObservation { readonly kind: 'column-failed'; readonly tab: ScopeId }
export interface FocusedObservation { readonly kind: 'focused'; readonly tab: ScopeId }
export interface RequestedObservation { readonly kind: 'requested'; readonly tab: ScopeId }
export interface VisibilityObservation { readonly kind: 'visibility'; readonly target: VisibilityTarget; readonly hidden: Visibility }
export interface HiddenRestoredObservation { readonly kind: 'hidden-restored'; readonly state: HiddenState }

export type Observation = DetectedObservation | ClosedObservation | StatusObservation | SessionObservation | ReconciledObservation | ColumnOpenedObservation
    | ColumnFailedObservation | FocusedObservation | RequestedObservation | SwitchedObservation | VisibilityObservation | HiddenRestoredObservation | RestoredObservation;

export type WatchSet = 'unchanged' | 'changed';

export interface Outcome {
    readonly board: Board;
    readonly intents: readonly Intent[];
    readonly watchSet: WatchSet;
}

interface Step {
    readonly board: Board;
    readonly intents: readonly Intent[];
    readonly watchSet: WatchSet;
}

const step = (board: Board, intents: readonly Intent[] = [], watchSet: WatchSet = 'unchanged'): Step => ({ board, intents, watchSet });

function recapsOf(board: Board, tabs: readonly ScopeId[], cause: RecapCause): readonly Intent[] {
    return [...new Set(tabs)]
        .map((tab) => ({ tab, lanes: lanesOf(board, tab) }))
        .filter(({ lanes }) => lanes.length > 0)
        .map(({ tab, lanes }) => ({ kind: 'recap', tab, lanes, cause }));
}

function withoutColumnAt(board: Board, seen: SeenLane): Board {
    const columns = new Map([...board.columns].filter(([, placed]) => String(placed.pane) !== seen.paneId));
    return columns.size === board.columns.size ? board : { ...board, columns };
}

function onDetected(held: Board, seen: SeenLane, now: Instant, policy: Policy): Step {
    const board = withoutColumnAt(held, seen);
    if (wantsKind(policy, seen.agent) === 'absent') {
        return step(board);
    }
    const fresh = laneFrom(seen);
    const prior = board.lanes.get(fresh.pane);
    const lane = incarnating(keepingSession(fresh, prior), prior, now);
    const isNew = !board.lanes.has(lane.pane);
    const closes = prior !== undefined && prior.agent !== lane.agent ? closedIntents([closureOf(prior, now)]) : [];
    const reads: Intent[] = isNew ? [{ kind: 'read-prompt', lane }] : [];
    return step({ ...board, lanes: put(board.lanes, lane.pane, lane) }, [...closes, { kind: 'publish', tab: lane.tab }, ...reads], isNew ? 'changed' : 'unchanged');
}

function closedIntents(closures: readonly ClosedLane[]): readonly Intent[] {
    return closures.map((closed) => ({ kind: 'lane-closed', closed }));
}

function onClosed(board: Board, pane: SessionKey, now: Instant, policy: Policy): Step {
    const lane = board.lanes.get(pane);
    if (lane !== undefined) {
        return step({ ...board, lanes: without(board.lanes, pane) }, [...closedIntents([closureOf(lane, now)]), { kind: 'publish', tab: lane.tab }], 'changed');
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

function keepingSession(lane: FollowedSession, held: FollowedSession | undefined): FollowedSession {
    return lane.session === null && held?.session && held.agent === lane.agent ? { ...lane, session: held.session } : lane;
}

function onSession(board: Board, seen: SessionObservation): Step {
    const lane = board.lanes.get(seen.pane);
    if (lane === undefined || String(lane.session) === seen.session) {
        return step(board);
    }
    return step({ ...board, lanes: put(board.lanes, seen.pane, { ...lane, session: must(parseSessionId(seen.session)) }) });
}

function onStatus(board: Board, seen: StatusObservation): Step {
    const pane = seen.pane;
    const lane = board.lanes.get(pane);
    const next = laneStatus(seen.status);
    if (lane === undefined || lane.status === next) {
        return step(board);
    }
    const after: Board = { ...board, lanes: put(board.lanes, pane, withStatus(lane, next)) };
    const ended = endsTurn(lane.status, next) === 'present' ? recapsOf(after, [lane.tab], 'turn-ended') : [];
    return step(after, [{ kind: 'publish', tab: lane.tab }, { kind: 'read-prompt', lane: withStatus(lane, next) }, ...ended]);
}

function turnsEndedBetween(before: Board, after: Board): readonly Intent[] {
    const tabs: ScopeId[] = [];
    for (const [pane, lane] of after.lanes) {
        const prior = before.lanes.get(pane);
        if (prior !== undefined && endsTurn(prior.status, lane.status) === 'present') {
            tabs.push(lane.tab);
        }
    }
    return recapsOf(after, tabs, 'turn-ended');
}

interface Extra { readonly tab: ScopeId; readonly pane: SessionKey }

interface ColumnsAfter { readonly columns: ReadonlyMap<ScopeId, Placement>; readonly extras: readonly Extra[] }

function columnsAfter(board: Board, seen: Reconciliation): ColumnsAfter {
    const alive = new Set(seen.panes);
    const agents = new Set(seen.lanes.map((lane) => lane.paneId));
    const columns = new Map([...board.columns].filter(([, placed]) => !agents.has(textOf(placed.pane)) && (alive.has(textOf(placed.pane)) || (seen.at !== undefined && placed.since !== undefined && seen.at < placed.since))));
    const extras: Extra[] = [];
    for (const column of seen.columns.filter((seenColumn) => !agents.has(seenColumn.paneId))) {
        const tab = parseTabId(column.tabId);
        const pane = parsePaneId(column.paneId);
        if (tab.kind === 'err' || pane.kind === 'err') {
            continue;
        }
        if (!columns.has(tab.value)) {
            columns.set(tab.value, { pane: pane.value, shape: column.shape });
        } else if (columns.get(tab.value)?.pane !== pane.value && !board.opening.has(tab.value)) {
            extras.push({ tab: tab.value, pane: pane.value });
        }
    }
    return { columns, extras };
}

function goneTabs(board: Board, seen: Reconciliation, now: Instant): readonly Intent[] {
    if (seen.tabs === undefined) {
        return [];
    }
    const live = new Set<string>([...seen.tabs, ...seen.lanes.map((lane) => lane.tabId), ...seen.columns.map((column) => column.tabId)]);
    const known = new Set<ScopeId>([...board.widths.keys(), ...board.columns.keys(), ...[...board.lanes.values()].map((lane) => lane.tab), ...(board.persisted ?? []).map((lane) => lane.tab)]);
    return [...known].filter((tab) => !live.has(tab)).map((tab) => ({ kind: 'tab-gone', tab, at: now }));
}

function seenTabs(board: Board, seen: Reconciliation): Pick<Board, 'widths' | 'focused'> {
    const widths = new Map<ScopeId, Count>();
    for (const [tab, width] of seen.widths) {
        const id = parseTabId(tab);
        if (id.kind === 'ok') {
            widths.set(id.value, width);
        }
    }
    const focus = parseTabId(seen.focusedTab);
    return { widths, focused: focus.kind === 'ok' ? focus.value : board.focused };
}

function onReconciled(board: Board, seen: Reconciliation, now: Instant, policy: Policy): Step {
    const lanes = new Map<SessionKey, FollowedSession>();
    for (const raw of seen.lanes.filter((lane) => wantsKind(policy, lane.agent) === 'present')) {
        const fresh = laneFrom(raw);
        const prior = board.lanes.get(fresh.pane) ?? board.persisted?.find((lane) => lane.pane === fresh.pane);
        const lane = incarnating(keepingSession(fresh, board.lanes.get(fresh.pane)), prior, now);
        lanes.set(lane.pane, lane);
    }
    const { columns, extras: found } = columnsAfter(board, seen);
    const extras = found.filter((extra) => lingering(board, extra.pane, now, policy) === 'absent');
    const alive = new Set(seen.panes);
    let closing = new Map([...board.closing].filter(([pane]) => alive.has(textOf(pane))));
    for (const extra of extras) {
        closing = new Map(closing).set(extra.pane, now);
    }
    let opening = board.opening;
    for (const tab of columns.keys()) {
        opening = removed(opening, tab);
    }
    const { widths, focused } = seenTabs(board, seen);
    const next: Board = { ...board, lanes, columns, closing, opening, widths, focused, seeded: seededOf(true), persisted: null };
    const sameSet = lanes.size === board.lanes.size && [...lanes.keys()].every((pane) => board.lanes.has(pane));
    const closures = closuresBetween(board.lanes, lanes, board.persisted ?? [], now);
    const publishedTabs = [...new Set([...tabsWithLanes(next), ...closures.map((closed) => closed.tab)])];
    const published: Intent[] = publishedTabs.map((tab) => ({ kind: 'publish', tab }));
    const reads: Intent[] = [...lanes.values()].filter((lane) => !board.lanes.has(lane.pane)).map((lane) => ({ kind: 'read-prompt', lane }));
    const closes: Intent[] = extras.map((extra) => ({ kind: 'close-column', tab: extra.tab, column: extra.pane }));
    const dead = deadColumnsAfter(next, seen, now, policy);
    return step(dead.board, [...closedIntents(closures), ...goneTabs(board, seen, now), ...turnsEndedBetween(board, next), ...published, ...reads, ...closes, ...dead.intents], sameSet ? 'unchanged' : 'changed');
}

function onRestored(board: Board, lanes: readonly RestoredLane[]): Step {
    return step({ ...board, persisted: lanes });
}

function onColumnOpened(board: Board, tab: ScopeId, placed: Placement): Step {
    const next: Board = { ...board, columns: put(board.columns, tab, placed), opening: removed(board.opening, tab) };
    return step(next, [{ kind: 'publish', tab }]);
}

type Operator = Extract<Observation, { kind: 'focused' | 'requested' | 'switched' | 'visibility' | 'hidden-restored' }>;

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
            return onDetected(board, observation.lane, now, policy);
        case 'closed':
            return onClosed(board, observation.pane, now, policy);
        case 'restored':
            return onRestored(board, observation.lanes);
        case 'status':
            return onStatus(board, observation);
        case 'session':
            return onSession(board, observation);
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

export function observe(board: Board, observation: Observation, now: Instant, policy: Policy): Outcome {
    const routed = route(board, observation, now, policy);
    const [settled, columnIntents] = settle(routed.board, now, policy);
    return {
        board: settled,
        intents: [...routed.intents, ...columnIntents].filter((intent) => !(intent.kind === 'close-column' && [board, routed.board].some((each) => each.lanes.has(intent.column)))),
        watchSet: routed.watchSet,
    };
}


export type { ColumnOpenedObservation, Reconciliation, SeenColumn, SessionObservation, StatusObservation, SwitchedObservation } from './seen.ts';
