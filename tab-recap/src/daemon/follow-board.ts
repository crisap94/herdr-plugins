import type { TabRecaps } from '#src/engine/tab-recaps.ts';
import { lanesOf, tabsWithLanes, type Board } from '#src/recap/domain/board.ts';
import type { TabId } from '#src/recap/domain/ids.ts';

export function onBeatOf(beat: (board: Board) => void, recaps: Pick<TabRecaps, 'sync'>, board: () => Board): () => void {
    let followed: ReadonlySet<TabId> = new Set();
    let shown: Board | null = null;
    return (): void => {
        const current = board();
        beat(current);
        if (current === shown) {
            return;
        }
        shown = current;
        for (const tab of new Set([...followed, ...tabsWithLanes(current)])) {
            recaps.sync(tab, lanesOf(current, tab));
        }
        followed = new Set(tabsWithLanes(current));
    };
}
