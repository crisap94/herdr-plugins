import { must } from '@stateforge-labs/session-ledger';
import { parseCount, type Count } from '@stateforge-labs/session-ledger';
import type { RecapSections } from '@stateforge-labs/session-ledger';
import { parseText, type Text, textOf } from '@stateforge-labs/session-ledger';

type ListSection = 'now' | 'needs' | 'done' | 'decisions' | 'next' | 'links' | 'rules';
export type Section = 'goal' | ListSection;
type Order = -1 | 0 | 1;

export interface ItemRow {
    readonly section: Section;
    readonly position: Count;
    readonly text: Text;
}

const LISTS: readonly ListSection[] = ['now', 'needs', 'done', 'decisions', 'next', 'links', 'rules'];
const FIRST = must(parseCount(0));

const rowOf = (section: Section, position: Count, text: Text): ItemRow => ({ section, position, text });

const byPosition = (a: ItemRow, b: ItemRow): Order => {
    if (a.position > b.position) return 1;
    if (a.position < b.position) return -1;
    return 0;
};

export function itemsOf(sections: RecapSections): readonly ItemRow[] {
    const goal: readonly ItemRow[] = sections.goal === '' ? [] : [rowOf('goal', FIRST, must(parseText(sections.goal)))];
    return [...goal, ...LISTS.flatMap((section) => sections[section].filter((line) => line !== '').map((line, index) => rowOf(section, must(parseCount(index)), must(parseText(line)))))];
}

export function sectionsOf(rows: readonly ItemRow[]): RecapSections {
    const lines = (section: Section): Text[] => rows.filter((row) => row.section === section).toSorted(byPosition).map((row) => row.text);
    return { goal: textOf(lines('goal')[0] ?? ''), now: lines('now'), needs: lines('needs'), done: lines('done'), decisions: lines('decisions'), next: lines('next'), links: lines('links'), rules: lines('rules') };
}
