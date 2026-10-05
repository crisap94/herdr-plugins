/** The recap's seven sections, as data. The goal is one line; every other section is a short list. */
export interface RecapSections {
    readonly goal: string;
    readonly now: readonly string[];
    readonly needs: readonly string[];
    readonly done: readonly string[];
    readonly decisions: readonly string[];
    readonly next: readonly string[];
    readonly links: readonly string[];
}

export type ListSection = Exclude<keyof RecapSections, 'goal'>;

/** The most bullets each list may hold. The goal is one line. */
export const CAPS: Readonly<Record<ListSection, number>> = { now: 3, needs: 3, done: 5, decisions: 3, next: 5, links: 6 };

/** The most words one line may hold; longer is clipped with `…`. */
export const MAX_WORDS = 16;

export const NO_SECTIONS: RecapSections = { goal: '', now: [], needs: [], done: [], decisions: [], next: [], links: [] };
