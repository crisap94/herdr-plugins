import type { Board, HiddenState } from '../../board.ts';
import type { TabId } from '../../ids.ts';

export function isHidden(board: Board, tab: TabId): boolean {
    return board.allHidden ? !board.shown.has(tab) : board.hidden.has(tab);
}

export function restoreHidden(board: Board, state: HiddenState): Board {
    return { ...board, allHidden: state.all, hidden: new Set(state.hidden as readonly TabId[]), shown: new Set(state.shown as readonly TabId[]) };
}
