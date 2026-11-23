import { must } from '#src/protocol/result.ts';
import { fits } from '#src/recap/domain/byte-budget.ts';
import type { ByteBudget } from '#src/recap/domain/byte-budget.ts';
import { compareIds } from '#src/recap/domain/handoff-content.ts';
import type { HandoffEntry, HandoffGroup, HandoffGroupId } from '#src/recap/domain/handoff-content.ts';
import { countOf, parseCount } from '#src/recap/domain/count.ts';
import type { Count } from '#src/recap/domain/count.ts';
import type { HandoffText } from '#src/recap/domain/handoff-sanitize.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { FreshnessBlock } from '#src/recap/render/freshness.ts';
import type { WorksiteBlock } from '#src/recap/render/worksite.ts';
import type { HandoffParts, HandoffReference, OmittedCounts } from './handoff-markdown.ts';
import { serializeHandoff } from './handoff-markdown.ts';

export interface HandoffFit {
    readonly reference: HandoffReference;
    readonly note: HandoffText | null;
    readonly freshnessText: FreshnessBlock;
    readonly worksiteText: WorksiteBlock | null;
    readonly groups: readonly HandoffGroup[];
    readonly withheld: Count;
}

export type FittedHandoff = { readonly kind: 'text'; readonly text: Text; readonly omitted: OmittedCounts } | { readonly kind: 'too-large' };

export type GroupsFit = Pick<HandoffFit, 'groups' | 'withheld'>;
export type GroupsShown = Pick<HandoffParts, 'groups' | 'omitted'>;
export type GroupsText = (shown: GroupsShown) => FittedHandoff;

const FIRST_TO_GO: readonly HandoffGroupId[] = ['now', 'next'];
const SECOND_TO_GO: readonly HandoffGroupId[] = ['done', 'links', 'closed'];

type Dropped = Partial<Record<HandoffGroupId, Count>>;

interface Victim {
    readonly group: HandoffGroupId;
    readonly entry: HandoffEntry;
}

const byteLength = (text: Text): Count => countOf(new TextEncoder().encode(text).byteLength);

const groupCountOf = (fit: GroupsFit, dropped: Dropped, id: HandoffGroupId): Count => must(parseCount((fit.groups.find((group) => group.id === id)?.capped ?? 0) + (dropped[id] ?? 0)));

const omittedOf = (fit: GroupsFit, dropped: Dropped): OmittedCounts => ({
    done: groupCountOf(fit, dropped, 'done'),
    links: groupCountOf(fit, dropped, 'links'),
    closed: groupCountOf(fit, dropped, 'closed'),
    now: groupCountOf(fit, dropped, 'now'),
    next: groupCountOf(fit, dropped, 'next'),
    withheld: must(parseCount(fit.withheld)),
});

const olderOf = (held: Victim, candidate: Victim): Victim => {
    const [a, b] = [candidate.entry, held.entry];
    return (a.lastAt === b.lastAt ? compareIds(a.id, b.id) < 0 : a.lastAt < b.lastAt) ? candidate : held;
};

const oldestIn = (groups: readonly HandoffGroup[], pool: readonly HandoffGroupId[]): Victim | null =>
    groups
        .filter((group) => pool.includes(group.id))
        .flatMap((group) => group.entries.map((entry): Victim => ({ group: group.id, entry })))
        .reduce<Victim | null>((oldest, candidate) => (oldest === null ? candidate : olderOf(oldest, candidate)), null);

const victimOf = (groups: readonly HandoffGroup[]): Victim | null => oldestIn(groups, FIRST_TO_GO) ?? oldestIn(groups, SECOND_TO_GO);

const without = (groups: readonly HandoffGroup[], victim: Victim): readonly HandoffGroup[] =>
    groups.map((group) => (group.id === victim.group ? { ...group, entries: group.entries.filter((entry) => entry !== victim.entry) } : group));

export function fitGroups(fit: GroupsFit, budget: ByteBudget, textOf: GroupsText): FittedHandoff {
    let groups = fit.groups;
    const dropped: Dropped = {};
    for (;;) {
        const shown = textOf({ groups, omitted: omittedOf(fit, dropped) });
        if (shown.kind === 'text' && fits(budget, byteLength(shown.text))) {
            return shown;
        }
        const victim = victimOf(groups);
        if (victim === null) {
            return { kind: 'too-large' };
        }
        groups = without(groups, victim);
        Object.assign(dropped, { [victim.group]: countOf((dropped[victim.group] ?? 0) + 1) });
    }
}

export function fitHandoff(fit: HandoffFit, budget: ByteBudget): FittedHandoff {
    return fitGroups(fit, budget, (shown): FittedHandoff => ({
        kind: 'text',
        text: serializeHandoff({ reference: fit.reference, note: fit.note, freshnessText: fit.freshnessText, worksiteText: fit.worksiteText, ...shown }),
        omitted: shown.omitted,
    }));
}
