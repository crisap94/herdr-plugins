import { must } from '@stateforge-labs/session-ledger';
import type { HistoryFact } from '@stateforge-labs/session-ledger';
import { CAPS, NO_SECTIONS } from '@stateforge-labs/session-ledger';
import type { RecapSections } from '@stateforge-labs/session-ledger';
import { parseText, type Text, textOf } from '@stateforge-labs/session-ledger';

export function sectionsOf(history: readonly HistoryFact[]): RecapSections {
    const open = history.filter((fact) => fact.state === 'open');
    const list = (section: keyof typeof CAPS): readonly Text[] => open.filter((fact) => fact.section === section).slice(0, CAPS[section]).map((fact) => must(parseText(fact.text)));
    return {
        ...NO_SECTIONS, goal: textOf(open.find((fact) => fact.section === 'goal')?.text ?? ''), now: list('now'), needs: list('needs'), done: list('done'), decisions: list('decisions'),
        next: list('next'), links: list('links'), rules: list('rules'),
    };
}
