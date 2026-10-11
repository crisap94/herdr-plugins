import type { Brand } from './brand.js';

export type PaneId = Brand<string, 'PaneId'>;

export function isPaneId(input: unknown): input is PaneId {
    return typeof input === 'string' && input.startsWith('p');
}
