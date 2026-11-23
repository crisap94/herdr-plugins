import { added, allHiddenOf, removed, without } from './board.ts';
import type { Board, HiddenState, Visibility, VisibilityTarget } from './board.ts';
import { uncheckedTabId } from './ids.ts';
import type { TabId } from './ids.ts';
import { textOf } from './text.ts';
import type { Presence } from './presence.ts';

export function isHidden(board: Board, tab: TabId): Presence {
    return (board.allHidden ? !board.shown.has(tab) : board.hidden.has(tab)) ? 'present' : 'absent';
}

export function restoreHidden(board: Board, state: HiddenState): Board {
    return { ...board, allHidden: state.all, hidden: new Set(state.hidden.map(uncheckedTabId)), shown: new Set(state.shown.map(uncheckedTabId)) };
}

function forgiven(board: Board, tab: TabId): Board {
    return { ...board, reopens: without(board.reopens, tab), givenUp: without(board.givenUp, tab) };
}

function resolved(board: Board, target: VisibilityTarget, change: Visibility): Presence {
    if (change !== 'toggle') {
        return change ? 'present' : 'absent';
    }
    const toggled = target === 'all' ? !board.allHidden : isHidden(board, target.tab) === 'absent';
    return toggled ? 'present' : 'absent';
}

export function withVisibility(board: Board, target: VisibilityTarget, change: Visibility): Board {
    const hidden = resolved(board, target, change) === 'present';
    if (target === 'all') {
        const cleared: Board = { ...board, allHidden: allHiddenOf(hidden), hidden: new Set(), shown: new Set() };
        return hidden ? cleared : { ...cleared, reopens: new Map(), givenUp: new Map() };
    }
    const tab = target.tab;
    const set = board.allHidden ? 'shown' : 'hidden';
    const wantsIn = board.allHidden ? !hidden : hidden;
    const next: Board = { ...board, [set]: wantsIn ? added(board[set], tab) : removed(board[set], tab) };
    return hidden ? next : forgiven(next, tab);
}

export function hiddenState(board: Board): HiddenState {
    return { all: board.allHidden, hidden: [...board.hidden].map((tab) => textOf(tab)).toSorted(), shown: [...board.shown].map((tab) => textOf(tab)).toSorted() };
}
