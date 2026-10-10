import type { HiddenState } from '#src/recap/domain/board.ts';

export const NOTHING_HIDDEN: HiddenState = { all: false, hidden: [], shown: [] };

export interface ColumnVisibility {
    readHidden(): HiddenState;
    writeHidden(state: HiddenState): void;
}
