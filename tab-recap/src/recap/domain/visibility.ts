import { added, removed, without } from './board.ts';
import type { Board, HiddenState, Visibility, VisibilityTarget } from './board.ts';
import type { TabId } from './ids.ts';
import type { Presence } from './presence.ts';
import { isHidden } from './twins/visibility/legacy.ts';

export * from './twins/visibility/legacy.ts';

function forgiven(board: Board, tab: TabId): Board {
    return { ...board, reopens: without(board.reopens, tab), givenUp: without(board.givenUp, tab) };
}

function resolved(board: Board, target: VisibilityTarget, change: Visibility): Presence {
    if (change !== 'toggle') {
        return change ? 'present' : 'absent';
    }
    const toggled = target === 'all' ? !board.allHidden : !isHidden(board, target.tab);
    return toggled ? 'present' : 'absent';
}

export function withVisibility(board: Board, target: VisibilityTarget, change: Visibility): Board {
    const hidden = resolved(board, target, change) === 'present';
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
