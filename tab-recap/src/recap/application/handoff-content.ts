import type { Fact } from '#src/recap/domain/fact.ts';
import type { Freshness } from '#src/recap/domain/freshness.ts';
import type { HandoffContent, HandoffEntry, HandoffGroup, HandoffGroupId } from '#src/recap/domain/handoff-content.ts';
import { compareIds, HANDOFF_GROUP_IDS } from '#src/recap/domain/handoff-content.ts';
import { sanitizeHandoffText } from '#src/recap/domain/handoff-sanitize.ts';
import { isForbidden } from '#src/recap/domain/handoff-vetting.ts';
import type { WorksiteSnapshot } from '#src/recap/domain/worksite.ts';
import { requestNoteOf } from './compact-start.ts';
import { HANDOFF_CLOSED_SHOWN, HANDOFF_DONE_SHOWN, HANDOFF_LINKS_SHOWN } from './handoff-limits.ts';
import { CLOSED_SHOWN_MS } from './ledger-input.ts';
import type { TaskFacts } from './ledger-input.ts';

export interface HandoffInput {
    readonly at: number;
    readonly task: Pick<TaskFacts, 'open' | 'closed'>;
    readonly freshness: Freshness;
    readonly worksite: WorksiteSnapshot;
    readonly note: string | null;
}

interface Candidate {
    readonly group: HandoffGroupId;
    readonly entry: HandoffEntry;
}

const CAPS: Partial<Record<HandoffGroupId, number>> = { done: HANDOFF_DONE_SHOWN, links: HANDOFF_LINKS_SHOWN, closed: HANDOFF_CLOSED_SHOWN };

const newestFirst = (a: HandoffEntry, b: HandoffEntry): number => b.lastAt - a.lastAt || compareIds(a.id, b.id);
const oldestFirst = (a: HandoffEntry, b: HandoffEntry): number => a.firstAt - b.firstAt || compareIds(a.id, b.id);

const entryOf = (fact: Fact, reason: string | null): HandoffEntry => ({
    id: fact.id,
    text: sanitizeHandoffText(fact.text),
    firstAt: fact.firstAt,
    lastAt: fact.lastAt,
    reason: reason === null ? null : sanitizeHandoffText(reason),
});

const closedInWindow = (at: number) => (fact: Fact): boolean => fact.closedAt !== null && fact.closedAt >= at - CLOSED_SHOWN_MS;

const candidatesOf = (open: readonly Fact[], closed: readonly Fact[]): readonly Candidate[] => [
    ...open.map((fact): Candidate => ({ group: fact.section, entry: entryOf(fact, fact.section === 'decisions' ? fact.why : null) })),
    ...closed.map((fact): Candidate => ({ group: 'closed', entry: entryOf(fact, fact.closedWhy) })),
];

const admitted = ({ entry }: Candidate): boolean => !isForbidden(entry.text) && (entry.reason === null || !isForbidden(entry.reason));

const groupOf = (id: HandoffGroupId, kept: readonly Candidate[]): HandoffGroup => {
    const entries = kept.filter((candidate) => candidate.group === id).map((candidate) => candidate.entry);
    const cap = CAPS[id];
    if (cap === undefined) {
        return { id, entries: entries.toSorted(oldestFirst), capped: 0 };
    }
    const shown = entries.toSorted(newestFirst).slice(0, cap);
    return { id, entries: shown.toSorted(oldestFirst), capped: entries.length - shown.length };
};

const noteOf = (raw: string | null): string | null => {
    if (raw === null) {
        return null;
    }
    const note = requestNoteOf(sanitizeHandoffText(raw));
    return note === null || isForbidden(note) ? null : note;
};

export function buildHandoffContent(input: HandoffInput): HandoffContent {
    const closed = input.task.closed.filter(closedInWindow(input.at));
    if (input.task.open.length === 0 && closed.length === 0) {
        return { kind: 'refused', reason: 'ledger-empty' };
    }
    const candidates = candidatesOf(input.task.open, closed);
    const kept = candidates.filter(admitted);
    const groups = HANDOFF_GROUP_IDS.map((id) => groupOf(id, kept));
    if (groups.every((group) => group.entries.length === 0)) {
        return { kind: 'refused', reason: 'content-empty' };
    }
    return { kind: 'content', note: noteOf(input.note), freshness: input.freshness, worksite: input.worksite, groups, withheld: candidates.length - kept.length };
}
