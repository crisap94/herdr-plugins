// What the column draws from a task's open facts: the newest last seen first, per section, under the caps. A view rule, not a storage rule.
import type { Fact } from './fact.ts';
import { CAPS } from './shape.ts';
import type { ListSection, RecapSections } from './shape.ts';

const newestFirst = (facts: readonly Fact[]): readonly Fact[] => facts.toSorted((a, b) => b.lastAt - a.lastAt);

/** The task's recap as sections: the open goal, and each list's newest open facts up to its cap. The input order breaks ties. */
export function sectionsOfOpen(open: readonly Fact[]): RecapSections {
    const live = newestFirst(open.filter((fact) => fact.state === 'open'));
    const list = (section: ListSection): readonly string[] => live.filter((fact) => fact.section === section).slice(0, CAPS[section]).map((fact) => fact.text);
    return {
        goal: live.find((fact) => fact.section === 'goal')?.text ?? '',
        now: list('now'), needs: list('needs'), done: list('done'), decisions: list('decisions'), next: list('next'), links: list('links'), rules: list('rules'),
    };
}
