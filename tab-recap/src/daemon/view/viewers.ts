import type { TabId } from '#src/recap/domain/ids.ts';
import type { Shown } from '#src/recap/domain/pacing.ts';
import type { Board } from '#src/recap/domain/board.ts';

export type Watching = (tab: TabId) => Shown;

export interface Viewers {
    readonly watching: Watching;
    attach(source: Watching): () => void;
}

export function viewersOf(): Viewers {
    let source: Watching | null = null;
    return {
        watching: (tab: TabId): Shown => source?.(tab) ?? 'hidden',
        attach: (next: Watching): (() => void) => {
            source = next;
            return (): void => {
                if (source === next) {
                    source = null;
                }
            };
        },
    };
}

export function visibleOf(board: () => Board, viewers: Pick<Viewers, 'watching'>): Watching {
    return (tab: TabId): Shown => (board().focused === tab ? 'shown' : viewers.watching(tab));
}
