import { added, lanesOf, put, removed, tabsWithLanes, without } from './board.ts';
import type { Board, Placement, Shape } from './board.ts';
import type { PaneId, TabId } from './ids.ts';
import type { Intent } from './intent.ts';
import { isHidden } from './visibility.ts';
import { duration, elapsed, instant } from './time.ts';
import type { Duration, Instant } from './time.ts';

export const ANY_KIND = '*';

export interface Policy {
    readonly kinds: readonly string[];
    readonly minTabCols: number;
    readonly reopenLimit: number;
    readonly reopenWindow: Duration;
    readonly giveUpFor: Duration;
    readonly closeGrace: Duration;
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

export function screenKindsOf(setting: string | undefined): readonly string[] {
    const names = (setting ?? '').toLowerCase().split(/[\s,]+/).map((name) => name.replace(/[^a-z0-9_-]/g, '')).filter((name) => name !== '');
    return names.includes('all') ? [ANY_KIND] : [...new Set(names)];
}

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

export function lingering(board: Board, pane: PaneId, now: Instant, policy: Policy): boolean {
    const since = board.closing.get(pane);
    return since !== undefined && elapsed(since, now) < policy.closeGrace;
}

function retried(board: Board, tab: TabId, now: Instant, policy: Policy): { board: Board; again: boolean; intents: readonly Intent[] } {
    if (isGivenUp(board, tab, now)) {
        return { board, again: false, intents: [] };
    }
    const [spent, intents] = spend(board, tab, now, policy);
    return { board: spent, again: !spent.givenUp.has(tab), intents };
}

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
        const retry = board.closing.has(placed.pane) ? retried(next, tab, now, policy) : { board: next, again: true, intents: [] };
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

export function settle(board: Board, now: Instant, policy: Policy): [Board, readonly Intent[]] {
    const [afterClose, closing] = closed(board, now, policy);
    const [afterOpen, opening] = opened(afterClose, now, policy);
    return [afterOpen, [...closing, ...opening]];
}

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
