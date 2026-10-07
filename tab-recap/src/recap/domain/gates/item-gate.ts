// What a gate is: a pure rule over one item of the writer's answer. It refuses (the item goes back once, then is dropped) or flags (kept, counted).
export type GateId = 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'G8' | 'G9';

/** The sections a gate looks at; `goal` is a single line, the others are lists. */
export type GatedSection = 'goal' | 'now' | 'needs' | 'done' | 'decisions' | 'next' | 'links' | 'rules';

/** One item with where it stands: `<task>/<section>/<position>` is its key. */
export interface Item {
    readonly task: string;
    readonly section: GatedSection;
    readonly position: number;
    readonly text: string;
}

/** What a gate may know besides the item: the language the recap is written in, who works in the tab, and the items of the same task kept before this one. */
export interface Context {
    readonly language: string;
    /** labels, kinds and ids (`a1`) of the tab's agents, lower-cased */
    readonly agents: readonly string[];
    readonly earlier: readonly Item[];
}

export interface Outcome {
    readonly kind: 'refuse' | 'flag';
    readonly gate: GateId;
    /** why, in the language the recap is written in */
    readonly reason: string;
}

/** Per gate, how many items it refused or flagged in a run, and how many refused items were finally dropped (stored with the run). */
export interface GateStats {
    readonly refused: Readonly<Record<string, number>>;
    readonly flagged: Readonly<Record<string, number>>;
    readonly dropped: number;
}

export interface Gate {
    readonly id: GateId;
    /** null: the item passes this gate */
    check(item: Item, context: Context): Outcome | null;
}

/** The reason in the recap's language (Spanish when the recap is, English otherwise). */
export const said = (language: string, en: string, es: string): string => (language === 'es' ? es : en);

/** The sections whose items are references or free lines the specific / pronoun / language rules do not apply to. */
export const LISTED: readonly GatedSection[] = ['now', 'needs', 'done', 'decisions', 'next', 'rules'];

export const itemKey = (item: Pick<Item, 'task' | 'section' | 'position'>): string => `${item.task}/${item.section}/${item.position}`;
