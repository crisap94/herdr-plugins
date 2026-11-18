export interface RecapSections {
    readonly goal: string;
    readonly now: readonly string[];
    readonly needs: readonly string[];
    readonly done: readonly string[];
    readonly decisions: readonly string[];
    readonly next: readonly string[];
    readonly links: readonly string[];
    readonly rules: readonly string[];
}

export type ListSection = Exclude<keyof RecapSections, 'goal'>;

export const CAPS: Readonly<Record<ListSection, number>> = { now: 3, needs: 3, done: 5, decisions: 3, next: 5, links: 6, rules: 5 };

export const MAX_WORDS = 16;

export const NO_SECTIONS: RecapSections = { goal: '', now: [], needs: [], done: [], decisions: [], next: [], links: [], rules: [] };
