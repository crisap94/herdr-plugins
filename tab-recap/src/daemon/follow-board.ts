import type { TabRecaps } from '#src/engine/tab-recaps.ts';
import { lanesOf, tabsWithLanes, type Board } from '#src/recap/domain/board.ts';
import type { ScopeId } from '#src/recap/domain/ids.ts';
import type { Pacing } from '#src/recap/domain/pacing.ts';

export function onBeatOf(beat: (board: Board) => void, recaps: Pick<TabRecaps, 'sync' | 'turnEnded'>, board: () => Board, pacing: Pacing): () => void {
    let followed: ReadonlySet<ScopeId> = new Set();
    let shown: Board | null = null;
    let startedUp = pacing.kind !== 'smart';
    return (): void => {
        const current = board();
        beat(current);
        if (current === shown) {
            return;
        }
        shown = current;
        const startingUp = !startedUp && tabsWithLanes(current).length > 0;
        for (const tab of new Set([...followed, ...tabsWithLanes(current)])) {
            if (startingUp) {
                recaps.turnEnded(tab, lanesOf(current, tab), 'turn-ended');
            } else {
                recaps.sync(tab, lanesOf(current, tab));
            }
        }
        if (startingUp) {
            startedUp = true;
        }
        followed = new Set(tabsWithLanes(current));
    };
}
