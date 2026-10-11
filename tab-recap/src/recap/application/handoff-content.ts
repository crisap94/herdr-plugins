import type { Ledger } from '#src/ports/ledger.ts';
import type { Fact, TaskId } from '#src/recap/domain/fact.ts';
import type { Freshness } from '#src/recap/domain/freshness.ts';
import type { HandoffContent, HandoffEntry, HandoffGroup, HandoffGroupId } from '#src/recap/domain/handoff-content.ts';
import { HANDOFF_GROUP_IDS } from '#src/recap/domain/handoff-content.ts';
import { isForbidden } from '#src/recap/domain/handoff-vetting.ts';
import type { HandoffId } from '#src/recap/domain/ids.ts';
import type { WorksiteSnapshot } from '#src/recap/domain/worksite.ts';
import { requestNoteOf } from './compact-start.ts';
import { HANDOFF_CLOSED_SHOWN, HANDOFF_DONE_SHOWN, HANDOFF_LINKS_SHOWN } from './handoff-limits.ts';
import { CLOSED_SHOWN_MS } from './ledger-input.ts';
import type { TaskFacts } from './ledger-input.ts';

export interface HandoffInput {
    readonly id: HandoffId;
    readonly at: number;
    readonly task: TaskFacts;
    readonly freshness: Freshness;
    readonly worksite: WorksiteSnapshot;
    readonly note: string | null;
}

interface Candidate {
    readonly group: HandoffGroupId;
    readonly entry: HandoffEntry;
}

const CAPS: Partial<Record<HandoffGroupId, number>> = { done: HANDOFF_DONE_SHOWN, links: HANDOFF_LINKS_SHOWN, closed: HANDOFF_CLOSED_SHOWN };

const compareIds = (a: string, b: string): number => {
    if (a === b) {
        return 0;
    }
    return a < b ? -1 : 1;
};
const newestFirst = (a: HandoffEntry, b: HandoffEntry): number => b.lastAt - a.lastAt || compareIds(a.id, b.id);
const oldestFirst = (a: HandoffEntry, b: HandoffEntry): number => a.firstAt - b.firstAt || compareIds(a.id, b.id);

const entryOf = (fact: Fact, reason: string | null): HandoffEntry => ({ id: fact.id, text: fact.text, firstAt: fact.firstAt, lastAt: fact.lastAt, reason });

const candidatesOf = (task: TaskFacts): readonly Candidate[] => [
    ...task.open.map((fact): Candidate => ({ group: fact.section, entry: entryOf(fact, fact.section === 'decisions' ? fact.why : null) })),
    ...task.closed.map((fact): Candidate => ({ group: 'closed', entry: entryOf(fact, fact.closedWhy) })),
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
    const note = requestNoteOf(raw);
    return note === null || isForbidden(note) ? null : note;
};

export function buildHandoffContent(input: HandoffInput): HandoffContent {
    if (input.task.open.length === 0 && input.task.closed.length === 0) {
        return { kind: 'refused', reason: 'ledger-empty' };
    }
    const candidates = candidatesOf(input.task);
    const kept = candidates.filter(admitted);
    const groups = HANDOFF_GROUP_IDS.map((id) => groupOf(id, kept));
    if (groups.every((group) => group.entries.length === 0)) {
        return { kind: 'refused', reason: 'content-empty' };
    }
    return { kind: 'content', id: input.id, at: input.at, note: noteOf(input.note), freshness: input.freshness, worksite: input.worksite, groups, withheld: candidates.length - kept.length };
}

export function taskFactsOf(ledger: Pick<Ledger, 'openOf' | 'recentlyClosed'>, task: TaskId, at: number): TaskFacts {
    return { key: task.key, open: ledger.openOf(task), closed: ledger.recentlyClosed(task, at - CLOSED_SHOWN_MS) };
}
