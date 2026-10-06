// RecapSections ⇄ item rows. Pure. The goal is one row (none when empty); a list is one row per bullet; an empty section is no rows.
import type { RecapSections } from '#src/recap/domain/shape.ts';

export interface ItemRow {
    readonly section: string;
    readonly position: number;
    readonly text: string;
}

const LISTS = ['now', 'needs', 'done', 'decisions', 'next', 'links'] as const;

export function itemsOf(sections: RecapSections): readonly ItemRow[] {
    const goal: readonly ItemRow[] = sections.goal === '' ? [] : [{ section: 'goal', position: 0, text: sections.goal }];
    return [...goal, ...LISTS.flatMap((section) => sections[section].filter((line) => line !== '').map((line, position) => ({ section, position, text: line })))];
}

/** The rows of one task, in any order, back to the seven sections. */
export function sectionsOf(rows: readonly ItemRow[]): RecapSections {
    const lines = (section: string): string[] => rows.filter((row) => row.section === section).toSorted((a, b) => a.position - b.position).map((row) => row.text);
    return { goal: lines('goal')[0] ?? '', now: lines('now'), needs: lines('needs'), done: lines('done'), decisions: lines('decisions'), next: lines('next'), links: lines('links') };
}
