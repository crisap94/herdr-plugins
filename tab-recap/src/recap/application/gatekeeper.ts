import { itemKey, outcomesOf } from '#src/recap/domain/gates/index.ts';
import type { GatedSection, GateStats, Item, Outcome } from '#src/recap/domain/gates/index.ts';
import type { ListSection, RecapSections } from '#src/recap/domain/shape.ts';
import type { RecapTask } from '#src/recap/domain/tasks.ts';

export interface Refusal {
    readonly item: Item;
    readonly outcome: Outcome;
}

export interface Gated {
    readonly tasks: readonly RecapTask[];
    readonly refusals: readonly Refusal[];
    readonly flagged: readonly Refusal[];
}

export const NO_STATS: GateStats = { refused: {}, flagged: {}, dropped: 0 };

const LISTS: readonly ListSection[] = ['now', 'needs', 'done', 'decisions', 'next', 'links', 'rules'];

function itemsOf(task: RecapTask, sections: RecapSections): readonly Item[] {
    const goal: Item[] = sections.goal === '' ? [] : [{ task: task.id, section: 'goal', position: 0, text: sections.goal }];
    return [...goal, ...LISTS.flatMap((section) => sections[section].map((text, position) => ({ task: task.id, section: section as GatedSection, position, text })))];
}

function without(task: RecapTask, sections: RecapSections, refused: ReadonlySet<string>): RecapSections {
    const keep = (section: ListSection): string[] => sections[section].filter((_, position) => !refused.has(itemKey({ task: task.id, section, position })));
    return {
        goal: refused.has(itemKey({ task: task.id, section: 'goal', position: 0 })) ? '' : sections.goal,
        now: keep('now'), needs: keep('needs'), done: keep('done'), decisions: keep('decisions'), next: keep('next'), links: keep('links'), rules: keep('rules'),
    };
}

function gateTask(task: RecapTask, tab: { readonly language: string; readonly agents: readonly string[] }): { readonly refusals: Refusal[]; readonly flagged: Refusal[]; readonly task: RecapTask } {
    const sections = task.sections;
    if (sections === null) {
        return { refusals: [], flagged: [], task };
    }
    const refusals: Refusal[] = [];
    const flagged: Refusal[] = [];
    const earlier: Item[] = [];
    for (const item of itemsOf(task, sections)) {
        const found = outcomesOf(item, { ...tab, earlier });
        const refusal = found.find((outcome) => outcome.kind === 'refuse');
        if (refusal === undefined) {
            earlier.push(item);
            flagged.push(...found.map((outcome) => ({ item, outcome })));
        } else {
            refusals.push({ item, outcome: refusal });
        }
    }
    const refused = new Set(refusals.map(({ item }) => itemKey(item)));
    return { refusals, flagged, task: refused.size === 0 ? task : { ...task, sections: without(task, sections, refused) } };
}

export function gate(tasks: readonly RecapTask[], tab: { readonly language: string; readonly agents: readonly string[] }): Gated {
    const gated = tasks.map((task) => gateTask(task, { language: tab.language, agents: tab.agents.filter((name) => name !== '').map((name) => name.toLowerCase()) }));
    return { tasks: gated.map(({ task }) => task), refusals: gated.flatMap(({ refusals }) => refusals), flagged: gated.flatMap(({ flagged }) => flagged) };
}

const countBy = (found: readonly Refusal[], into: Readonly<Record<string, number>> = {}): Record<string, number> => {
    const counts: Record<string, number> = { ...into };
    for (const { outcome } of found) {
        counts[outcome.gate] = (counts[outcome.gate] ?? 0) + 1;
    }
    return counts;
};

export function statsOf(answer: Gated, before: GateStats, last: boolean): GateStats {
    return { refused: countBy(answer.refusals, before.refused), flagged: countBy(answer.flagged), dropped: last ? answer.refusals.length : 0 };
}

export function correctionOf(refusals: readonly Refusal[]): string {
    const lines = refusals.map(({ item, outcome }) => `- ${outcome.gate} ${item.section}: "${item.text}" — ${outcome.reason}`);
    return ['These items were refused. Rewrite each so it passes, or leave it out:', ...lines].join('\n');
}
