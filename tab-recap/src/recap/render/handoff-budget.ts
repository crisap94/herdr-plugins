import { fits } from '#src/recap/domain/byte-budget.ts';
import type { ByteBudget } from '#src/recap/domain/byte-budget.ts';
import { compareIds } from '#src/recap/domain/handoff-content.ts';
import type { HandoffEntry, HandoffGroup, HandoffGroupId } from '#src/recap/domain/handoff-content.ts';
import type { HandoffReference, OmittedCounts } from './handoff-markdown.ts';
import { serializeHandoff } from './handoff-markdown.ts';

export interface HandoffFit {
    readonly reference: HandoffReference;
    readonly note: string | null;
    readonly freshnessText: string;
    readonly worksiteText: string | null;
    readonly groups: readonly HandoffGroup[];
    readonly withheld: number;
}

export type FittedHandoff = { readonly kind: 'text'; readonly text: string; readonly omitted: OmittedCounts } | { readonly kind: 'too-large' };

const FIRST_TO_GO: readonly HandoffGroupId[] = ['now', 'next'];
const SECOND_TO_GO: readonly HandoffGroupId[] = ['done', 'links', 'closed'];

type Dropped = Partial<Record<HandoffGroupId, number>>;

interface Victim {
    readonly group: HandoffGroupId;
    readonly entry: HandoffEntry;
}

const byteLength = (text: string): number => new TextEncoder().encode(text).byteLength;

const countOf = (fit: HandoffFit, dropped: Dropped, id: HandoffGroupId): number => (fit.groups.find((group) => group.id === id)?.capped ?? 0) + (dropped[id] ?? 0);

const omittedOf = (fit: HandoffFit, dropped: Dropped): OmittedCounts => ({
    done: countOf(fit, dropped, 'done'),
    links: countOf(fit, dropped, 'links'),
    closed: countOf(fit, dropped, 'closed'),
    now: countOf(fit, dropped, 'now'),
    next: countOf(fit, dropped, 'next'),
    withheld: fit.withheld,
});

const olderThan = (a: HandoffEntry, b: HandoffEntry): boolean => (a.lastAt === b.lastAt ? compareIds(a.id, b.id) < 0 : a.lastAt < b.lastAt);

const oldestIn = (groups: readonly HandoffGroup[], pool: readonly HandoffGroupId[]): Victim | null =>
    groups
        .filter((group) => pool.includes(group.id))
        .flatMap((group) => group.entries.map((entry): Victim => ({ group: group.id, entry })))
        .reduce<Victim | null>((oldest, candidate) => (oldest === null || olderThan(candidate.entry, oldest.entry) ? candidate : oldest), null);

const victimOf = (groups: readonly HandoffGroup[]): Victim | null => oldestIn(groups, FIRST_TO_GO) ?? oldestIn(groups, SECOND_TO_GO);

const without = (groups: readonly HandoffGroup[], victim: Victim): readonly HandoffGroup[] =>
    groups.map((group) => (group.id === victim.group ? { ...group, entries: group.entries.filter((entry) => entry !== victim.entry) } : group));

export function fitHandoff(fit: HandoffFit, budget: ByteBudget): FittedHandoff {
    let groups = fit.groups;
    const dropped: Dropped = {};
    for (;;) {
        const omitted = omittedOf(fit, dropped);
        const text = serializeHandoff({
            reference: fit.reference,
            note: fit.note,
            freshnessText: fit.freshnessText,
            worksiteText: fit.worksiteText,
            groups,
            omitted,
        });
        if (fits(budget, byteLength(text))) {
            return { kind: 'text', text, omitted };
        }
        const victim = victimOf(groups);
        if (victim === null) {
            return { kind: 'too-large' };
        }
        groups = without(groups, victim);
        Object.assign(dropped, { [victim.group]: (dropped[victim.group] ?? 0) + 1 });
    }
}
