export type GateId = 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'G8' | 'G9';

export type GatedSection = 'goal' | 'now' | 'needs' | 'done' | 'decisions' | 'next' | 'links' | 'rules';

export interface Item {
    readonly task: string;
    readonly section: GatedSection;
    readonly position: number;
    readonly text: string;
}

export interface Context {
    readonly language: string;
    readonly agents: readonly string[];
    readonly earlier: readonly Item[];
}

export interface Outcome {
    readonly kind: 'refuse' | 'flag';
    readonly gate: GateId;
    readonly reason: string;
}

export interface GateStats {
    readonly refused: Readonly<Record<string, number>>;
    readonly flagged: Readonly<Record<string, number>>;
    readonly dropped: number;
}

export interface Gate {
    readonly id: GateId;
    check(item: Item, context: Context): Outcome | null;
}

export const said = (language: string, en: string, es: string): string => (language === 'es' ? es : en);

export const LISTED: readonly GatedSection[] = ['now', 'needs', 'done', 'decisions', 'next', 'rules'];

export const itemKey = (item: Pick<Item, 'task' | 'section' | 'position'>): string => `${item.task}/${item.section}/${item.position}`;
