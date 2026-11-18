import type { Context, Item, Outcome } from './legacy.ts';

export type GateId = 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'G8' | 'G9';

export type GatedSection = 'goal' | 'now' | 'needs' | 'done' | 'decisions' | 'next' | 'links' | 'rules';

export interface Gate {
    readonly id: GateId;
    check(item: Item, context: Context): Outcome | null;
}

export const LISTED: readonly GatedSection[] = ['now', 'needs', 'done', 'decisions', 'next', 'rules'];

export type { Context, GateStats, Item, Outcome } from './legacy.ts';
export { said } from './legacy.ts';
