import type { Brand } from './brand.js';

export type PaneId = Brand<string, 'PaneId'>;

export function paneLabel(id: PaneId): PaneId {
    return id;
}
