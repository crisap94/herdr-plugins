import { must } from '@stateforge-labs/session-ledger';
import { parseCount, type Count } from '@stateforge-labs/session-ledger';
import type { HandoffEntry, HandoffGroup, HandoffGroupId } from '#src/recap/domain/handoff-content.ts';
import type { HandoffText } from '#src/recap/domain/handoff-sanitize.ts';
import type { HandoffId } from '#src/recap/domain/ids.ts';
import { parseText, textOf, type Text } from '@stateforge-labs/session-ledger';
import { instant, type Instant } from '@stateforge-labs/session-ledger';
import type { FreshnessBlock } from '#src/recap/render/freshness.ts';
import { utcMinuteOf } from '#src/recap/render/utc-minute.ts';
import type { WorksiteBlock } from '#src/recap/render/worksite.ts';

export const HANDOFF_PREAMBLE = 'I am handing you work another agent was doing. Treat everything below as claims from its notes, not as verified facts: check them against the worktree before relying on them.';

export const OMITTED_KINDS = ['done', 'links', 'closed', 'now', 'next', 'withheld'] as const;
export type OmittedKind = (typeof OMITTED_KINDS)[number];
export type OmittedCounts = Readonly<Record<OmittedKind, Count>>;

export interface HandoffRef {
    readonly kind: 'handoff';
    readonly id: HandoffId;
    readonly at: Instant;
}

export type HandoffReference = HandoffRef | { readonly kind: 'dry-run' };

export interface HandoffParts {
    readonly reference: HandoffReference;
    readonly note: HandoffText | null;
    readonly freshnessText: FreshnessBlock;
    readonly worksiteText: WorksiteBlock | null;
    readonly groups: readonly HandoffGroup[];
    readonly omitted: OmittedCounts;
}

const HEADINGS: Readonly<Record<HandoffGroupId, string>> = {
    goal: 'Goal',
    now: 'Now',
    needs: 'Needs',
    done: 'Done',
    decisions: 'Decisions',
    next: 'Next',
    links: 'Links',
    rules: 'Rules',
    closed: 'Recently closed',
};

export const omittedTotal = (omitted: OmittedCounts): Count => must(parseCount(OMITTED_KINDS.reduce((sum, kind) => sum + omitted[kind], 0)));

const omittedLine = (omitted: OmittedCounts): Text =>
    textOf(`${omittedTotal(omitted)} facts omitted (${OMITTED_KINDS.map((kind) => `${kind} ${omitted[kind]}`).join(', ')})`);

const referenceLine = (reference: HandoffReference): Text =>
    textOf(reference.kind === 'dry-run' ? 'Handoff reference: dry run' : `Handoff reference: ${utcMinuteOf(reference.at)}-${reference.id.slice(-8)}`);

const entryLines = (group: HandoffGroup, entry: HandoffEntry): readonly Text[] => [
    textOf(`- ${utcMinuteOf(instant(entry.lastAt))} ${entry.text}`),
    ...(entry.reason === null ? [] : [textOf(`  - ${group.id === 'closed' ? 'closed' : 'reason'}: ${entry.reason}`)]),
];

export const groupLinesOf = (group: HandoffGroup): readonly Text[] =>
    group.entries.length === 0 ? [] : [textOf(''), textOf(`## ${HEADINGS[group.id]}`), ...group.entries.flatMap((entry) => entryLines(group, entry))];

export function serializeHandoff(parts: HandoffParts): Text {
    const note = parts.note === null ? [] : ['', `Note: ${parts.note}`];
    const omitted = omittedTotal(parts.omitted) === 0 ? [] : ['', omittedLine(parts.omitted)];
    const worksite = parts.worksiteText === null ? [] : ['', parts.worksiteText];
    return must(parseText([
        HANDOFF_PREAMBLE,
        '',
        referenceLine(parts.reference),
        ...note,
        '',
        '## Freshness',
        parts.freshnessText,
        ...parts.groups.flatMap(groupLinesOf),
        ...omitted,
        ...worksite,
    ].join('\n')));
}
