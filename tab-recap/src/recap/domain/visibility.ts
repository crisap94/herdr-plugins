import { added, removed, without } from './board.ts';
import type { Board, HiddenState, Visibility, VisibilityTarget } from './board.ts';
import type { TabId } from './ids.ts';

/** Is this tab's column hidden by the operator? With the blanket on, a tab is hidden unless it was shown again by name. */
export function isHidden(board: Board, tab: TabId): boolean {
    return board.allHidden ? !board.shown.has(tab) : board.hidden.has(tab);
}

/** Showing a tab again also forgets its reopen history: the operator's word beats the daemon's give-up. */
function forgiven(board: Board, tab: TabId): Board {
    return { ...board, reopens: without(board.reopens, tab), givenUp: without(board.givenUp, tab) };
}

/** What a request comes to: hide or show. A toggle flips what the board holds now, so requests applied in order always alternate. */
function resolved(board: Board, target: VisibilityTarget, change: Visibility): boolean {
    if (change !== 'toggle') {
        return change;
    }
    return target === 'all' ? !board.allHidden : !isHidden(board, target.tab);
}

export function withVisibility(board: Board, target: VisibilityTarget, change: Visibility): Board {
    const hidden = resolved(board, target, change);
    if (target === 'all') {
        const cleared: Board = { ...board, allHidden: hidden, hidden: new Set(), shown: new Set() };
        return hidden ? cleared : { ...cleared, reopens: new Map(), givenUp: new Map() };
    }
    const tab = target.tab;
    const set = board.allHidden ? 'shown' : 'hidden';
    const wantsIn = board.allHidden ? !hidden : hidden;
    const next: Board = { ...board, [set]: wantsIn ? added(board[set], tab) : removed(board[set], tab) };
    return hidden ? next : forgiven(next, tab);
}

export function hiddenState(board: Board): HiddenState {
    return { all: board.allHidden, hidden: [...board.hidden].map(String).toSorted(), shown: [...board.shown].map(String).toSorted() };
}

export function restoreHidden(board: Board, state: HiddenState): Board {
    return { ...board, allHidden: state.all, hidden: new Set(state.hidden as readonly TabId[]), shown: new Set(state.shown as readonly TabId[]) };
}
