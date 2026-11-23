import { allHiddenOf, type HiddenState } from '#src/recap/domain/board.ts';

export const NOTHING_HIDDEN: HiddenState = { all: allHiddenOf(false), hidden: [], shown: [] };

export interface ColumnVisibility {
    readHidden(): HiddenState;
    writeHidden(state: HiddenState): void;
}
