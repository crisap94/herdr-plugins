import type { Brand } from './brand.js';

export type PaneId = Brand<string, 'PaneId'>;

export type Title = 'idle' | 'busy';

export interface Pane {
    readonly id: PaneId;
    readonly title: Title;
}

export function focus(pane: Pane): Pane {
    return pane;
}
