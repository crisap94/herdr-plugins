import { must } from '@stateforge-labs/session-ledger';
import { textOf as asText } from '@stateforge-labs/session-ledger';
import type { Fact } from '@stateforge-labs/session-ledger';
import type { HandoffBody, HandoffContent, HandoffEntry, HandoffGroup, HandoffGroupId } from '#src/recap/domain/handoff-content.ts';
import { compareIds, HANDOFF_GROUP_IDS } from '#src/recap/domain/handoff-content.ts';
import { cleanHandoffText } from '#src/recap/domain/handoff-sanitize.ts';
import { vetHandoffText } from '#src/recap/domain/handoff-vetting.ts';
import { parseText } from '@stateforge-labs/session-ledger';
import type { Text } from '@stateforge-labs/session-ledger';
import type { Instant } from '@stateforge-labs/session-ledger';
import { HANDOFF_CLOSED_SHOWN, HANDOFF_CLOSED_WINDOW_MS, HANDOFF_DONE_SHOWN, HANDOFF_LINKS_SHOWN } from './handoff-limits.ts';
import { countOf } from '@stateforge-labs/session-ledger';

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
    text: cleanHandoffText(asText(fact.text)),
    firstAt: fact.firstAt,
    lastAt: fact.lastAt,
    reason: reason === null ? null : cleanHandoffText(asText(reason)),
});

const candidatesOf = (open: readonly Fact[], closed: readonly Fact[]): readonly Candidate[] => [
    ...open.map((fact): Candidate => ({ group: fact.section, entry: entryOf(fact, fact.section === 'decisions' && fact.why !== null ? must(parseText(fact.why)) : null) })),
    ...closed.map((fact): Candidate => ({ group: 'closed', entry: entryOf(fact, fact.closedWhy === null ? null : must(parseText(fact.closedWhy))) })),
];

const groupOf = (id: HandoffGroupId, kept: readonly Candidate[]): HandoffGroup => {
    const entries = kept.filter((candidate) => candidate.group === id).map((candidate) => candidate.entry);
    const cap = CAPS[id];
    if (cap === undefined) {
        return { id, entries: entries.toSorted(oldestFirst), capped: countOf(0) };
    }
    const shown = entries.toSorted(newestFirst).slice(0, cap);
    return { id, entries: shown.toSorted(oldestFirst), capped: countOf(entries.length - shown.length) };
};

export function groupedFactsOf(facts: GroupedFacts): Grouped {
    const closed = facts.closed.filter((fact) => fact.closedAt !== null && fact.closedAt >= facts.at - HANDOFF_CLOSED_WINDOW_MS);
    if (facts.open.length === 0 && closed.length === 0) {
        return { kind: 'refused', reason: 'ledger-empty' };
    }
    const candidates = candidatesOf(facts.open, closed);
    const kept = candidates.filter(({ entry }) => !(vetHandoffText(entry.text).kind === 'err') && (entry.reason === null || !(vetHandoffText(entry.reason).kind === 'err')));
    const groups = HANDOFF_GROUP_IDS.map((id) => groupOf(id, kept));
    if (groups.every((group) => group.entries.length === 0)) {
        return { kind: 'refused', reason: 'content-empty' };
    }
    return { kind: 'groups', groups, withheld: countOf(candidates.length - kept.length) };
}
