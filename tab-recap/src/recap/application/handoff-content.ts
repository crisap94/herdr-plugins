import type { Fact, FactId } from '#src/recap/domain/fact.ts';
import type { Freshness } from '#src/recap/domain/freshness.ts';
import type { HandoffContent, HandoffEntry, HandoffGroup, HandoffGroupId } from '#src/recap/domain/handoff-content.ts';
import { HANDOFF_GROUP_IDS } from '#src/recap/domain/handoff-content.ts';
import { sanitizeHandoffText } from '#src/recap/domain/handoff-sanitize.ts';
import type { HandoffText } from '#src/recap/domain/handoff-sanitize.ts';
import { isForbidden } from '#src/recap/domain/handoff-vetting.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import type { WorksiteSnapshot } from '#src/recap/domain/worksite.ts';
import { must } from '#src/protocol/result.ts';
import { NOTE_LIMIT } from './compaction-message.ts';
import { HANDOFF_CLOSED_SHOWN, HANDOFF_DONE_SHOWN, HANDOFF_LINKS_SHOWN } from './handoff-limits.ts';
import { CLOSED_SHOWN_MS } from '@stateforge-labs/session-ledger/unstable/recap/application/ledger-input.ts';
import type { TaskFacts } from '@stateforge-labs/session-ledger/unstable/recap/application/ledger-input.ts';

export interface HandoffInput {
    readonly at: Instant;
    readonly task: Pick<TaskFacts, 'open' | 'closed'>;
    readonly freshness: Freshness;
    readonly worksite: WorksiteSnapshot;
    readonly note: Text | null;
}

interface Candidate {
    readonly group: HandoffGroupId;
    readonly entry: HandoffEntry;
}

type Ordering = -1 | 0 | 1;

type Admission = 'kept' | 'withheld';

const CAPS: Partial<Record<HandoffGroupId, number>> = { done: HANDOFF_DONE_SHOWN, links: HANDOFF_LINKS_SHOWN, closed: HANDOFF_CLOSED_SHOWN };

const idOrder = (a: FactId, b: FactId): Ordering => {
    if (a === b) {
        return 0;
    }
    return a < b ? -1 : 1;
};

const newestFirst = (a: HandoffEntry, b: HandoffEntry): Ordering => {
    if (a.lastAt === b.lastAt) {
        return idOrder(a.id, b.id);
    }
    return b.lastAt < a.lastAt ? -1 : 1;
};

const oldestFirst = (a: HandoffEntry, b: HandoffEntry): Ordering => {
    if (a.firstAt === b.firstAt) {
        return idOrder(a.id, b.id);
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

const admission = ({ entry }: Candidate): Admission => (!isForbidden(entry.text) && (entry.reason === null || !isForbidden(entry.reason)) ? 'kept' : 'withheld');

const groupOf = (id: HandoffGroupId, kept: readonly Candidate[]): HandoffGroup => {
    const entries = kept.filter((candidate) => candidate.group === id).map((candidate) => candidate.entry);
    const cap = CAPS[id];
    if (cap === undefined) {
        return { id, entries: entries.toSorted(oldestFirst), capped: 0 };
    }
    const shown = entries.toSorted(newestFirst).slice(0, cap);
    return { id, entries: shown.toSorted(oldestFirst), capped: entries.length - shown.length };
};

const noteOf = (raw: Text | null): HandoffText | null => {
    if (raw === null) {
        return null;
    }
    const sanitized = sanitizeHandoffText(raw);
    const note = sanitizeHandoffText(Array.from(sanitized).slice(0, NOTE_LIMIT).join(''));
    return note === '' || isForbidden(note) ? null : note;
};

export function buildHandoffContent(input: HandoffInput): HandoffContent {
    const closed = input.task.closed.filter((fact) => fact.closedAt !== null && fact.closedAt >= input.at - CLOSED_SHOWN_MS);
    if (input.task.open.length === 0 && closed.length === 0) {
        return { kind: 'refused', reason: 'ledger-empty' };
    }
    const candidates = candidatesOf(input.task.open, closed);
    const kept = candidates.filter((candidate) => admission(candidate) === 'kept');
    const groups = HANDOFF_GROUP_IDS.map((id) => groupOf(id, kept));
    if (groups.every((group) => group.entries.length === 0)) {
        return { kind: 'refused', reason: 'content-empty' };
    }
    return { kind: 'content', note: noteOf(input.note), freshness: input.freshness, worksite: input.worksite, groups, withheld: candidates.length - kept.length };
}
