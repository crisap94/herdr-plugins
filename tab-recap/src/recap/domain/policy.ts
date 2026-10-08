import { added, lanesOf, put, removed, tabsWithLanes, without } from './board.ts';
import type { Board, Placement, Shape } from './board.ts';
import type { PaneId, TabId } from './ids.ts';
import type { Intent } from './intent.ts';
import { isHidden } from './visibility.ts';
import { duration, elapsed, instant } from './time.ts';
import type { Duration, Instant } from './time.ts';

/** In `Policy.kinds`: every agent kind herdr recognises. */
export const ANY_KIND = '*';

export interface Policy {
    /** agent kinds that get a column; `ANY_KIND` stands for all of them */
    readonly kinds: readonly string[];
    /** tabs narrower than this (a phone client) get a bar instead of a side column */
    readonly minTabCols: number;
    readonly reopenLimit: number;
    readonly reopenWindow: Duration;
    readonly giveUpFor: Duration;
    /** a close that has not taken effect after this long is asked for again, and counts against the tab's reopen budget */
    readonly closeGrace: Duration;
    /** when non-empty, only these tabs get a column (a staged rollout) */
    readonly onlyTabs: readonly string[];
}

export const DEFAULT_POLICY: Policy = {
    kinds: ['claude', 'codex', 'opencode'],
    minTabCols: 110,
    reopenLimit: 3,
    reopenWindow: duration(120_000),
    giveUpFor: duration(600_000),
    closeGrace: duration(30_000),
    onlyTabs: [],
};

export const wantsKind = (policy: Policy, agent: string): boolean => policy.kinds.includes(ANY_KIND) || policy.kinds.includes(agent);

/**
 * The agent kinds the operator reads from their screen (`TAB_RECAP_SCREEN_AGENTS`): `all` or a list of
 * kind names, as a setting; the list holds `ANY_KIND` for `all`. Characters that are not part of a plain name are dropped.
 */
export function screenKindsOf(setting: string | undefined): readonly string[] {
    const names = (setting ?? '').toLowerCase().split(/[\s,]+/).map((name) => name.replace(/[^a-z0-9_-]/g, '')).filter((name) => name !== '');
    return names.includes('all') ? [ANY_KIND] : [...new Set(names)];
}

/** The setting as it is stored: `all`, a comma list, or empty for none. */
export function screenSetting(setting: string | undefined): string {
    const kinds = screenKindsOf(setting);
    return kinds.includes(ANY_KIND) ? 'all' : kinds.join(',');
}

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

function opened(board: Board, now: Instant, policy: Policy): [Board, Intent[]] {
    const wanting = tabsWithLanes(board).filter((tab) =>
        !board.columns.has(tab) && !board.opening.has(tab) && deserves(board, tab, now, policy));
    const opening = wanting.reduce((set, tab) => added(set, tab), board.opening);
    return [{ ...board, opening }, wanting.map((tab) => ({ kind: 'open-column', tab, shape: shapeFor(board, tab, policy) }))];
}

/** Asked to close, and not long enough ago to ask again. */
export function lingering(board: Board, pane: PaneId, now: Instant, policy: Policy): boolean {
    const since = board.closing.get(pane);
    return since !== undefined && elapsed(since, now) < policy.closeGrace;
}

/** A close that did not take effect within the grace: it counts against the tab's budget; a tab given up keeps the column. */
function retried(board: Board, tab: TabId, pane: PaneId, now: Instant, policy: Policy): { board: Board; again: boolean; intents: readonly Intent[] } {
    if (isGivenUp(board, tab, now)) {
        return { board, again: false, intents: [] };
    }
    const [spent, intents] = spend(board, tab, now, policy);
    return { board: spent, again: !spent.givenUp.has(tab), intents };
}

/** Close what the board no longer wants — and a column of the wrong shape, so `opened` docks the right one once it is gone. */
function closed(board: Board, now: Instant, policy: Policy): [Board, Intent[]] {
    const flips = (tab: TabId, placed: Placement): boolean => placed.shape !== shapeFor(board, tab, policy) && !isGivenUp(board, tab, now);
    const unwanted = (tab: TabId): boolean => !board.enabled || isHidden(board, tab) || lanesOf(board, tab).length === 0;
    const closing = new Map(board.closing);
    const intents: Intent[] = [];
    let next = board;
    for (const [tab, placed] of board.columns) {
        const gone = unwanted(tab) || flips(tab, placed);
        if (!gone && isGivenUp(board, tab, now)) {
            closing.delete(placed.pane);
        }
        if (!gone || lingering(board, placed.pane, now, policy)) {
            continue;
        }
        const retry = board.closing.has(placed.pane) ? retried(next, tab, placed.pane, now, policy) : { board: next, again: true, intents: [] };
        next = retry.board;
        intents.push(...retry.intents);
        if (!retry.again) {
            if (!unwanted(tab)) {
                closing.delete(placed.pane);
            }
            continue;
        }
        closing.set(placed.pane, now);
        intents.push({ kind: 'close-column', tab, column: placed.pane });
    }
    return [{ ...next, closing }, intents];
}

/** After every observation: open the columns the board lacks, close the ones it no longer wants. */
export function settle(board: Board, now: Instant, policy: Policy): [Board, readonly Intent[]] {
    const [afterClose, closing] = closed(board, now, policy);
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
