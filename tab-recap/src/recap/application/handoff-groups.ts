import { must } from '#src/protocol/result.ts';
import type { Fact } from '#src/recap/domain/fact.ts';
import type { HandoffBody, HandoffContent, HandoffEntry, HandoffGroup, HandoffGroupId } from '#src/recap/domain/handoff-content.ts';
import { compareIds, HANDOFF_GROUP_IDS } from '#src/recap/domain/handoff-content.ts';
import { sanitizeHandoffText } from '#src/recap/domain/handoff-sanitize.ts';
import { isForbidden } from '#src/recap/domain/handoff-vetting.ts';
import { parseText } from '#src/recap/domain/text.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import { HANDOFF_CLOSED_SHOWN, HANDOFF_CLOSED_WINDOW_MS, HANDOFF_DONE_SHOWN, HANDOFF_LINKS_SHOWN } from './handoff-limits.ts';

export interface GroupedFacts {
    readonly at: Instant;
    readonly open: readonly Fact[];
    readonly closed: readonly Fact[];
}

export interface Grouping extends Pick<HandoffBody, 'groups' | 'withheld'> {
    readonly kind: 'groups';
}

export type Grouped = Grouping | Extract<HandoffContent, { readonly kind: 'refused' }>;

interface Candidate {
    readonly group: HandoffGroupId;
    readonly entry: HandoffEntry;
}

type Ordering = -1 | 0 | 1;

const CAPS: Partial<Record<HandoffGroupId, number>> = { done: HANDOFF_DONE_SHOWN, links: HANDOFF_LINKS_SHOWN, closed: HANDOFF_CLOSED_SHOWN };

const newestFirst = (a: HandoffEntry, b: HandoffEntry): Ordering => {
    if (a.lastAt === b.lastAt) {
        return compareIds(a.id, b.id);
    }
    return b.lastAt < a.lastAt ? -1 : 1;
};

const oldestFirst = (a: HandoffEntry, b: HandoffEntry): Ordering => {
    if (a.firstAt === b.firstAt) {
        return compareIds(a.id, b.id);
    }
    return a.firstAt < b.firstAt ? -1 : 1;
};

const entryOf = (fact: Fact, reason: Text | null): HandoffEntry => ({
    id: fact.id,
    text: sanitizeHandoffText(fact.text),
    firstAt: fact.firstAt,
    lastAt: fact.lastAt,
    reason: reason === null ? null : sanitizeHandoffText(reason),
});

const candidatesOf = (open: readonly Fact[], closed: readonly Fact[]): readonly Candidate[] => [
    ...open.map((fact): Candidate => ({ group: fact.section, entry: entryOf(fact, fact.section === 'decisions' && fact.why !== null ? must(parseText(fact.why)) : null) })),
    ...closed.map((fact): Candidate => ({ group: 'closed', entry: entryOf(fact, fact.closedWhy === null ? null : must(parseText(fact.closedWhy))) })),
];

const groupOf = (id: HandoffGroupId, kept: readonly Candidate[]): HandoffGroup => {
    const entries = kept.filter((candidate) => candidate.group === id).map((candidate) => candidate.entry);
    const cap = CAPS[id];
    if (cap === undefined) {
        return { id, entries: entries.toSorted(oldestFirst), capped: 0 };
    }
    const shown = entries.toSorted(newestFirst).slice(0, cap);
    return { id, entries: shown.toSorted(oldestFirst), capped: entries.length - shown.length };
};

export function groupedFactsOf(facts: GroupedFacts): Grouped {
    const closed = facts.closed.filter((fact) => fact.closedAt !== null && fact.closedAt >= facts.at - HANDOFF_CLOSED_WINDOW_MS);
    if (facts.open.length === 0 && closed.length === 0) {
        return { kind: 'refused', reason: 'ledger-empty' };
    }
    const candidates = candidatesOf(facts.open, closed);
    const kept = candidates.filter(({ entry }) => !isForbidden(entry.text) && (entry.reason === null || !isForbidden(entry.reason)));
    const groups = HANDOFF_GROUP_IDS.map((id) => groupOf(id, kept));
    if (groups.every((group) => group.entries.length === 0)) {
        return { kind: 'refused', reason: 'content-empty' };
    }
    return { kind: 'groups', groups, withheld: candidates.length - kept.length };
}
