import { must } from '@stateforge-labs/session-ledger';
import { parseText, textOf, type Text } from '@stateforge-labs/session-ledger';
import { countOf, type Count } from '@stateforge-labs/session-ledger';
import type { Instant } from '@stateforge-labs/session-ledger';
import { jaccard } from '@stateforge-labs/session-ledger';
import type { Fact } from '@stateforge-labs/session-ledger';
import { localTime } from '@stateforge-labs/session-ledger';

const pct = (part: Count, whole: Count): Text => textOf(whole === 0 ? 'n/a' : `${Math.round((100 * part) / whole)}%`);
const words = (fact: Fact): Count => countOf(fact.text.split(/\s+/).filter((word) => word !== '').length);

export interface Check {
    readonly name: Text;
    readonly passed: Count;
    readonly of: Count;
}

export function checksOf(facts: readonly Fact[]): readonly Check[] {
    const open = facts.filter((fact) => fact.state === 'open');
    const decisions = facts.filter((fact) => fact.section === 'decisions');
    const repeats = open.filter((fact, at) => open.slice(0, at).some((earlier) => earlier.section === fact.section && earlier.task.key === fact.task.key && jaccard(textOf(earlier.text), textOf(fact.text)) >= 0.6));
    return [
        { name: textOf('short (≤ 16 words)'), passed: countOf(facts.filter((fact) => words(fact) <= 16).length), of: countOf(facts.length) },
        { name: textOf('decisions carry a why'), passed: countOf(decisions.filter((fact) => fact.why !== null && fact.why !== '(not recorded)').length), of: countOf(decisions.length) },
        { name: textOf('no open repeats'), passed: countOf(open.length - repeats.length), of: countOf(open.length) },
    ];
}

export function reportOf(title: Text, facts: readonly Fact[]): Text {
    const open = facts.filter((fact) => fact.state === 'open').length;
    const lines = checksOf(facts).map((check) => `  ${check.name.padEnd(28)} ${pct(check.passed, check.of).padStart(5)}  (${check.passed}/${check.of})`);
    return textOf([`${title}: ${facts.length} facts, ${open} open, ${facts.length - open} closed`, ...lines].join('\n'));
}

export function ledgerText(facts: readonly Fact[], zone: Text): Text {
    const at = (ms: Instant): Text => localTime(ms, ms, must(parseText(zone)));
    return textOf(facts.map((fact) => `  ${fact.section.padEnd(9)} ${fact.state === 'open' ? 'open  ' : (fact.closedWhy ?? 'closed').padEnd(6)} ${at(fact.firstAt)}–${at(fact.lastAt)}  ${fact.text}${fact.why === null ? '' : ` — ${fact.why}`}`).join('\n'));
}

export const anchoredLine = (facts: readonly Fact[]): Text => {
    const anchored = facts.filter((fact) => fact.anchor !== null).length;
    return textOf(`facts with an anchor found in the input: ${anchored} of ${facts.length} (${pct(countOf(anchored), countOf(facts.length))})`);
};
