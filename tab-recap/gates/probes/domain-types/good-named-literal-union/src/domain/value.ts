export type Door = 'open' | 'closed';

export function flip(door: Door): Door {
    return door === 'open' ? 'closed' : 'open';
}
