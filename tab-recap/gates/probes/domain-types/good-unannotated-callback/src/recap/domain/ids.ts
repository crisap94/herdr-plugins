import { brand, type Brand } from './brand.js';

export type PaneId = Brand<string, 'PaneId'>;

export type Door = 'open' | 'closed';

export function ids(text: Door): readonly PaneId[] {
    return text.split('').map((char) => brand(char, 'PaneId'));
}
