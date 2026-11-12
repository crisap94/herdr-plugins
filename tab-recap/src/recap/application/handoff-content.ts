import type { Freshness } from '#src/recap/domain/freshness.ts';
import type { HandoffContent } from '#src/recap/domain/handoff-content.ts';
import { sanitizeHandoffText } from '#src/recap/domain/handoff-sanitize.ts';
import type { HandoffText } from '#src/recap/domain/handoff-sanitize.ts';
import { isForbidden } from '#src/recap/domain/handoff-vetting.ts';
import { instant } from '#src/recap/domain/time.ts';
import type { WorksiteSnapshot } from '#src/recap/domain/worksite.ts';
import { NOTE_LIMIT } from './compaction-message.ts';
import { groupedFactsOf } from './handoff-groups.ts';
import type { TaskFacts } from './ledger-input.ts';

export interface HandoffInput {
    readonly at: number;
    readonly task: Pick<TaskFacts, 'open' | 'closed'>;
    readonly freshness: Freshness;
    readonly worksite: WorksiteSnapshot;
    readonly note: string | null;
}

const noteOf = (raw: string | null): HandoffText | null => {
    if (raw === null) {
        return null;
    }
    const sanitized = sanitizeHandoffText(raw);
    const note = sanitizeHandoffText(Array.from(sanitized).slice(0, NOTE_LIMIT).join(''));
    return note === '' || isForbidden(note) ? null : note;
};

export function buildHandoffContent(input: HandoffInput): HandoffContent {
    const grouped = groupedFactsOf({ at: instant(input.at), open: input.task.open, closed: input.task.closed });
    if (grouped.kind === 'refused') {
        return grouped;
    }
    return { kind: 'content', note: noteOf(input.note), freshness: input.freshness, worksite: input.worksite, groups: grouped.groups, withheld: grouped.withheld };
}
