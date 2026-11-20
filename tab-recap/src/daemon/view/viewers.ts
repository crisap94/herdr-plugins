import type { TabId } from '#src/recap/domain/ids.ts';
import type { Shown } from '#src/recap/domain/pacing.ts';

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
