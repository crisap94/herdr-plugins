import type { Fact } from './fact.ts';
import { CAPS } from './shape.ts';
import type { ListSection, RecapSections } from './shape.ts';

const newestFirst = (facts: readonly Fact[]): readonly Fact[] => facts.toSorted((a, b) => b.lastAt - a.lastAt);

export function sectionsOfOpen(open: readonly Fact[]): RecapSections {
    const live = newestFirst(open.filter((fact) => fact.state === 'open'));
    const list = (section: ListSection): readonly string[] => live.filter((fact) => fact.section === section).slice(0, CAPS[section]).map((fact) => fact.text);
    return {
        goal: live.find((fact) => fact.section === 'goal')?.text ?? '',
        now: list('now'), needs: list('needs'), done: list('done'), decisions: list('decisions'), next: list('next'), links: list('links'), rules: list('rules'),
    };
}
