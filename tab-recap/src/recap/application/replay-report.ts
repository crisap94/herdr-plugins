// The report of a replay: checks that need no model, the facts as the ledger holds them. A judge, when there is one, adds its own lines.
import { jaccard } from '#src/recap/domain/gates/jaccard.ts';
import type { Fact } from '#src/recap/domain/fact.ts';
import { localTime } from './local-time.ts';

const pct = (part: number, whole: number): string => (whole === 0 ? 'n/a' : `${Math.round((100 * part) / whole)}%`);
const words = (fact: Fact): number => fact.text.split(/\s+/).filter((word) => word !== '').length;

export interface Check {
    readonly name: string;
    readonly passed: number;
    readonly of: number;
}

/** Mechanical checks over facts: one fact, one line (≤ 16 words), a decision says why, no open fact repeats another of its task and section. */
export function checksOf(facts: readonly Fact[]): readonly Check[] {
    const open = facts.filter((fact) => fact.state === 'open');
    const decisions = facts.filter((fact) => fact.section === 'decisions');
    const repeats = open.filter((fact, at) => open.slice(0, at).some((earlier) => earlier.section === fact.section && earlier.task.key === fact.task.key && jaccard(earlier.text, fact.text) >= 0.6));
    return [
        { name: 'short (≤ 16 words)', passed: facts.filter((fact) => words(fact) <= 16).length, of: facts.length },
        { name: 'decisions carry a why', passed: decisions.filter((fact) => fact.why !== null && fact.why !== '(not recorded)').length, of: decisions.length },
        { name: 'no open repeats', passed: open.length - repeats.length, of: open.length },
    ];
}

export function reportOf(title: string, facts: readonly Fact[]): string {
    const open = facts.filter((fact) => fact.state === 'open').length;
    const lines = checksOf(facts).map((check) => `  ${check.name.padEnd(28)} ${pct(check.passed, check.of).padStart(5)}  (${check.passed}/${check.of})`);
    return [`${title}: ${facts.length} facts, ${open} open, ${facts.length - open} closed`, ...lines].join('\n');
}

/** The ledger as the replay left it, section by section; times are local. */
export function ledgerText(facts: readonly Fact[], zone: string): string {
    const at = (ms: number): string => localTime(ms, ms, zone);
    return facts.map((fact) => `  ${fact.section.padEnd(9)} ${fact.state === 'open' ? 'open  ' : (fact.closedWhy ?? 'closed').padEnd(6)} ${at(fact.firstAt)}–${at(fact.lastAt)}  ${fact.text}${fact.why === null ? '' : ` — ${fact.why}`}`).join('\n');
}

/** How many of the facts quote their input (G11 refuses an add whose quote is not in it, so every fact the gates let through does). */
export const anchoredLine = (facts: readonly Fact[]): string => {
    const anchored = facts.filter((fact) => fact.anchor !== null).length;
    return `facts with an anchor found in the input: ${anchored} of ${facts.length} (${pct(anchored, facts.length)})`;
};
