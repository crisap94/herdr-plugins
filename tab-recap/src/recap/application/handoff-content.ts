import type { Freshness } from '#src/recap/domain/freshness.ts';
import { textOf as asText } from '@stateforge-labs/session-ledger';
import type { HandoffContent } from '#src/recap/domain/handoff-content.ts';
import { cleanHandoffText } from '#src/recap/domain/handoff-sanitize.ts';
import type { HandoffText } from '#src/recap/domain/handoff-sanitize.ts';
import { vetHandoffText } from '#src/recap/domain/handoff-vetting.ts';
import type { Text } from '@stateforge-labs/session-ledger';
import type { Instant } from '@stateforge-labs/session-ledger';
import type { WorksiteSnapshot } from '#src/recap/domain/worksite.ts';
import { NOTE_LIMIT } from './compaction-message.ts';
import { groupedFactsOf } from './handoff-groups.ts';
import type { TaskFacts } from '@stateforge-labs/session-ledger';

export interface HandoffInput {
    readonly at: Instant;
    readonly task: Pick<TaskFacts, 'open' | 'closed'>;
    readonly freshness: Freshness;
    readonly worksite: WorksiteSnapshot;
    readonly note: Text | null;
}

const noteOf = (raw: Text | null): HandoffText | null => {
    if (raw === null) {
        return null;
    }
    const sanitized = cleanHandoffText(asText(raw));
    const note = cleanHandoffText(asText(Array.from(sanitized).slice(0, NOTE_LIMIT).join('')));
    return note === '' || (vetHandoffText(note).kind === 'err') ? null : note;
};

export function buildHandoffContent(input: HandoffInput): HandoffContent {
    const grouped = groupedFactsOf({ at: input.at, open: input.task.open, closed: input.task.closed });
    if (grouped.kind === 'refused') {
        return grouped;
    }
    return { kind: 'content', note: noteOf(input.note), freshness: input.freshness, worksite: input.worksite, groups: grouped.groups, withheld: grouped.withheld };
}
