import type { HiddenState } from '#src/recap/domain/board.ts';

export const NOTHING_HIDDEN: HiddenState = { all: false, hidden: [], shown: [] };

/** Which columns the operator turned off, as the daemon last saved it. */
export interface ColumnVisibility {
    readHidden(): HiddenState;
    writeHidden(state: HiddenState): void;
}
