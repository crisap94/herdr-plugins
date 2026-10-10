import type { HistoryFact } from '#src/ports/ledger.ts';
import { CAPS, NO_SECTIONS } from '#src/recap/domain/shape.ts';
import type { RecapSections } from '#src/recap/domain/shape.ts';

export function sectionsOf(history: readonly HistoryFact[]): RecapSections {
    const open = history.filter((fact) => fact.state === 'open');
    const list = (section: keyof typeof CAPS): string[] => open.filter((fact) => fact.section === section).slice(0, CAPS[section]).map((fact) => fact.text);
    return {
        ...NO_SECTIONS, goal: open.find((fact) => fact.section === 'goal')?.text ?? '', now: list('now'), needs: list('needs'), done: list('done'), decisions: list('decisions'),
        next: list('next'), links: list('links'), rules: list('rules'),
    };
}
