import type { ColumnVisibility } from '#src/ports/column-visibility.ts';
import type { HiddenState } from '#src/recap/domain/board.ts';

export class AllHidden implements ColumnVisibility {
    readHidden(): HiddenState {
        return { all: true, hidden: [], shown: [] };
    }

    writeHidden(): void {
    }
}
