import { added, lanesOf, put, removed, tabsWithLanes, without } from './board.ts';
import type { Board, Placement, Shape } from './board.ts';
import type { SessionKey, ScopeId } from './ids.ts';
import type { Intent } from './intent.ts';
import { isHidden } from './visibility.ts';
import { parseCount } from './count.ts';
import type { Count } from './count.ts';
import type { Presence } from './presence.ts';
import { must } from '#src/protocol/result.ts';
import { duration, elapsed, instant } from './time.ts';
import type { Duration, Instant } from './time.ts';
import { REGISTERED_KINDS, kindsWith } from './registered-kinds.ts';
import type { RegisteredKindTable } from './registered-kinds.ts';
import { textOf } from './text.ts';
import type { Text } from './text.ts';

export const ANY_KIND = textOf('*');

export interface Policy {
    readonly kinds: readonly Text[];
    readonly minTabCols: Count;
    readonly reopenLimit: Count;
    readonly reopenWindow: Duration;
    readonly giveUpFor: Duration;
    readonly closeGrace: Duration;
    readonly onlyTabs: readonly Text[];
}

export function defaultPolicyKinds<T extends RegisteredKindTable>(table: T): readonly (keyof T)[] {
    return kindsWith(table, 'defaultPolicy');
}

export const DEFAULT_POLICY: Policy = {
    kinds: defaultPolicyKinds(REGISTERED_KINDS).map((kind) => textOf(kind)),
    minTabCols: must(parseCount(110)),
    reopenLimit: must(parseCount(3)),
    reopenWindow: duration(120_000),
    giveUpFor: duration(600_000),
    closeGrace: duration(30_000),
    onlyTabs: [],
};

export const wantsKind = (policy: Policy, agent: Text): Presence => (policy.kinds.includes(ANY_KIND) || policy.kinds.includes(agent) ? 'present' : 'absent');

export function screenKindsOf(setting: Text | undefined): readonly Text[] {
    const names = (setting ?? '').toLowerCase().split(/[\s,]+/).map((name) => name.replace(/[^a-z0-9_-]/g, '')).filter((name) => name !== '');
    return names.includes('all') ? [ANY_KIND] : [...new Set(names)].map(textOf);
}

export function screenSetting(setting: Text | undefined): Text {
    const kinds = screenKindsOf(setting);
    return kinds.includes(ANY_KIND) ? textOf('all') : textOf(kinds.join(','));
}

export function lingering(board: Board, pane: SessionKey, now: Instant, policy: Policy): Presence {
    const since = board.closing.get(pane);
    return since !== undefined && elapsed(since, now) < policy.closeGrace ? 'present' : 'absent';
}

export function shapeFor(board: Board, tab: ScopeId, policy: Policy): Shape {
    const width = board.widths.get(tab);
    return width === undefined || width >= policy.minTabCols ? 'side' : 'bar';
}

function isGivenUp(board: Board, tab: ScopeId, now: Instant): Presence {
    const until = board.givenUp.get(tab);
    return until !== undefined && now < until ? 'present' : 'absent';
}

export function deserves(board: Board, tab: ScopeId, now: Instant, policy: Policy): Presence {
    return (board.enabled
        && isHidden(board, tab) === 'absent'
        && (policy.onlyTabs.length === 0 || policy.onlyTabs.includes(textOf(tab)))
        && lanesOf(board, tab).length > 0
        && isGivenUp(board, tab, now) === 'absent')
        ? 'present'
        : 'absent';
}

function opened(board: Board, now: Instant, policy: Policy): [Board, Intent[]] {
    const wanting = tabsWithLanes(board).filter((tab) =>
        !board.columns.has(tab) && !board.opening.has(tab) && deserves(board, tab, now, policy) === 'present');
    const opening = wanting.reduce((set, tab) => added(set, tab), board.opening);
    return [{ ...board, opening }, wanting.map((tab) => ({ kind: 'open-column', tab, shape: shapeFor(board, tab, policy) }))];
}

interface RetryStep {
    readonly board: Board;
    readonly again: Presence;
    readonly intents: readonly Intent[];
}

function retried(board: Board, tab: ScopeId, now: Instant, policy: Policy): RetryStep {
    if (isGivenUp(board, tab, now) === 'present') {
        return { board, again: 'absent', intents: [] };
    }
    const [spent, intents] = spend(board, tab, now, policy);
    return { board: spent, again: spent.givenUp.has(tab) ? 'absent' : 'present', intents };
}

function closed(board: Board, now: Instant, policy: Policy): [Board, Intent[]] {
    const flips = (tab: ScopeId, placed: Placement): Presence =>
        placed.shape !== shapeFor(board, tab, policy) && isGivenUp(board, tab, now) === 'absent' ? 'present' : 'absent';
    const unwanted = (tab: ScopeId): Presence =>
        !board.enabled || isHidden(board, tab) === 'present' || lanesOf(board, tab).length === 0 ? 'present' : 'absent';
    const closing = new Map(board.closing);
    const intents: Intent[] = [];
    let next = board;
    for (const [tab, placed] of board.columns) {
        const gone = unwanted(tab) === 'present' || flips(tab, placed) === 'present';
        if (!gone && isGivenUp(board, tab, now) === 'present') {
            closing.delete(placed.pane);
        }
        if (!gone || lingering(board, placed.pane, now, policy) === 'present') {
            continue;
        }
        const retry: RetryStep = board.closing.has(placed.pane) ? retried(next, tab, now, policy) : { board: next, again: 'present', intents: [] };
        next = retry.board;
        intents.push(...retry.intents);
        if (retry.again === 'absent') {
            if (unwanted(tab) === 'absent') {
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

export function spend(board: Board, tab: ScopeId, now: Instant, policy: Policy): [Board, readonly Intent[]] {
    const recent = (board.reopens.get(tab) ?? []).filter((at) => elapsed(at, now) < policy.reopenWindow);
    const history = [...recent, now];
    const next: Board = { ...board, reopens: put(board.reopens, tab, history), opening: removed(board.opening, tab) };
    if (history.length < policy.reopenLimit) {
        return [next, []];
    }
    const until = instant(now + policy.giveUpFor);
    return [
        { ...next, givenUp: put(next.givenUp, tab, until), reopens: without(next.reopens, tab) },
        [{ kind: 'give-up', tab, reopens: must(parseCount(history.length)) }],
    ];
}
