import { added, lanesOf, put, removed, tabsWithLanes, without } from './board.ts';
import type { Board, Shape } from './board.ts';
import type { TabId } from './ids.ts';
import type { Intent } from './intent.ts';
import { isHidden } from './visibility.ts';
import { duration, elapsed, instant } from './time.ts';
import type { Duration, Instant } from './time.ts';

export interface Policy {
    /** agent kinds that get a column */
    readonly kinds: readonly string[];
    /** tabs narrower than this (a phone client) get a bar instead of a side column */
    readonly minTabCols: number;
    readonly reopenLimit: number;
    readonly reopenWindow: Duration;
    readonly giveUpFor: Duration;
    /** when non-empty, only these tabs get a column (a staged rollout) */
    readonly onlyTabs: readonly string[];
}

export const DEFAULT_POLICY: Policy = {
    kinds: ['claude', 'codex'],
    minTabCols: 110,
    reopenLimit: 3,
    reopenWindow: duration(120_000),
    giveUpFor: duration(600_000),
    onlyTabs: [],
};

function isGivenUp(board: Board, tab: TabId, now: Instant): boolean {
    const until = board.givenUp.get(tab);
    return until !== undefined && now < until;
}

export function shapeFor(board: Board, tab: TabId, policy: Policy): Shape {
    const width = board.widths.get(tab);
    return width === undefined || width >= policy.minTabCols ? 'side' : 'bar';
}

export function deserves(board: Board, tab: TabId, now: Instant, policy: Policy): boolean {
    return board.enabled
        && !isHidden(board, tab)
        && (policy.onlyTabs.length === 0 || policy.onlyTabs.includes(String(tab)))
        && lanesOf(board, tab).length > 0
        && !isGivenUp(board, tab, now);
}

/**
 * Docking a bar on top needs a pane swap, and herdr's swap moves the operator's focus to the
 * swapped tab. So a bar is docked only in the tab the operator is already looking at.
 */
function dockableNow(board: Board, tab: TabId, policy: Policy): boolean {
    return shapeFor(board, tab, policy) === 'side' || board.focused === tab;
}

function opened(board: Board, now: Instant, policy: Policy): [Board, Intent[]] {
    const wanting = tabsWithLanes(board).filter((tab) =>
        !board.columns.has(tab) && !board.opening.has(tab) && deserves(board, tab, now, policy) && dockableNow(board, tab, policy));
    const opening = wanting.reduce((set, tab) => added(set, tab), board.opening);
    return [{ ...board, opening }, wanting.map((tab) => ({ kind: 'open-column', tab, shape: shapeFor(board, tab, policy) }))];
}

/** Close what the board no longer wants — and a column of the wrong shape, so `opened` docks the right one. */
function closed(board: Board, policy: Policy): [Board, Intent[]] {
    const unwanted = [...board.columns].filter(([tab, placed]) =>
        !board.enabled || isHidden(board, tab) || lanesOf(board, tab).length === 0 || placed.shape !== shapeFor(board, tab, policy));
    const columns = unwanted.reduce((map, [tab]) => without(map, tab), board.columns);
    return [{ ...board, columns }, unwanted.map(([tab, placed]) => ({ kind: 'close-column', tab, column: placed.pane }))];
}

/** After every observation: open the columns the board lacks, close the ones it no longer wants. */
export function settle(board: Board, now: Instant, policy: Policy): [Board, readonly Intent[]] {
    const [afterClose, closing] = closed(board, policy);
    const [afterOpen, opening] = opened(afterClose, now, policy);
    return [afterOpen, [...closing, ...opening]];
}

/** A column went away without us closing it: count it against the tab's reopen budget. */
export function spend(board: Board, tab: TabId, now: Instant, policy: Policy): [Board, readonly Intent[]] {
    const recent = (board.reopens.get(tab) ?? []).filter((at) => elapsed(at, now) < policy.reopenWindow);
    const history = [...recent, now];
    const next: Board = { ...board, reopens: put(board.reopens, tab, history), opening: removed(board.opening, tab) };
    if (history.length < policy.reopenLimit) {
        return [next, []];
    }
    const until = instant(now + policy.giveUpFor);
    return [
        { ...next, givenUp: put(next.givenUp, tab, until), reopens: without(next.reopens, tab) },
        [{ kind: 'give-up', tab, reopens: history.length }],
    ];
}
