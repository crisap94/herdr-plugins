import type { Count, GateName } from '#src/contract/kernel.ts';
import type { Text } from '../text.ts';

export type GateId = 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'G8' | 'G9';

export type GatedSection = 'goal' | 'now' | 'needs' | 'done' | 'decisions' | 'next' | 'links' | 'rules';

export interface Item {
    readonly task: Text;
    readonly section: GatedSection;
    readonly position: Count;
    readonly text: Text;
}

export interface Context {
    readonly language: Text;
    readonly agents: readonly Text[];
    readonly earlier: readonly Item[];
}

export interface Outcome {
    readonly kind: 'refuse' | 'flag';
    readonly gate: GateId;
    readonly reason: Text;
}

export interface Gate {
    readonly id: GateId;
    check(item: Item, context: Context): Outcome | null;
}

export const LISTED: readonly GatedSection[] = ['now', 'needs', 'done', 'decisions', 'next', 'rules'];

export interface GateStats {
    readonly refused: Readonly<Record<GateName, Count>>;
    readonly flagged: Readonly<Record<GateName, Count>>;
    readonly dropped: Count;
}

export const said = (language: Text, en: Text, es: Text): Text => (language === 'es' ? es : en);
