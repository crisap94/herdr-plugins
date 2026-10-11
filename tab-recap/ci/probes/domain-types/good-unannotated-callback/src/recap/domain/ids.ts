import { brand, type Brand } from './brand.js';

export type PaneId = Brand<string, 'PaneId'>;

export function ids(text: 'open' | 'closed'): readonly PaneId[] {
    return text.split('').map((char) => brand(char, 'PaneId'));
}
