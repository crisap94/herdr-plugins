import type { Fact } from '@stateforge-labs/session-ledger/unstable/recap/domain/fact.ts';
import { CAPS } from '@stateforge-labs/session-ledger/unstable/recap/domain/shape.ts';
import type { ListSection, RecapSections } from '@stateforge-labs/session-ledger/unstable/recap/domain/shape.ts';
import { textOf, type Text } from '@stateforge-labs/session-ledger/unstable/recap/domain/text.ts';

type Ordering = -1 | 0 | 1;

const newer = (a: Fact, b: Fact): Ordering => {
    if (a.lastAt > b.lastAt) {
        return -1;
    }
    return a.lastAt < b.lastAt ? 1 : 0;
};

const newestFirst = (facts: readonly Fact[]): readonly Fact[] => facts.toSorted(newer);


export function sectionsOfOpen(open: readonly Fact[]): RecapSections {
    const live = newestFirst(open.filter((fact) => fact.state === 'open'));
    const list = (section: ListSection): readonly Text[] => live.filter((fact) => fact.section === section).slice(0, CAPS[section]).map((fact) => fact.text);
    return {
        goal: live.find((fact) => fact.section === 'goal')?.text ?? textOf(''),
        now: list('now'), needs: list('needs'), done: list('done'), decisions: list('decisions'), next: list('next'), links: list('links'), rules: list('rules'),
    };
}
