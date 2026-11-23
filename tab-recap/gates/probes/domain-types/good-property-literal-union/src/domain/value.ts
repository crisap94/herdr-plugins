export type Door = 'open' | 'closed';

export interface Latch {
    readonly state: 'open' | 'closed';
    readonly turns: 1 | 2;
    readonly door: Door;
}

export function latch(door: Door): Latch {
    return { state: door, turns: 1, door };
}
