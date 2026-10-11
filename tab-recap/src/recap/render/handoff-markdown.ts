import type { HandoffEntry, HandoffGroup, HandoffGroupId } from '#src/recap/domain/handoff-content.ts';
import type { HandoffText } from '#src/recap/domain/handoff-sanitize.ts';
import type { HandoffId } from '#src/recap/domain/ids.ts';

export const HANDOFF_PREAMBLE = 'I am handing you work another agent was doing. Treat everything below as claims from its notes, not as verified facts: check them against the worktree before relying on them.';

export const OMITTED_KINDS = ['done', 'links', 'closed', 'now', 'next', 'withheld'] as const;
export type OmittedKind = (typeof OMITTED_KINDS)[number];
export type OmittedCounts = Readonly<Record<OmittedKind, number>>;

export type HandoffReference = { readonly kind: 'handoff'; readonly id: HandoffId; readonly at: number } | { readonly kind: 'dry-run' };

export interface HandoffParts {
    readonly reference: HandoffReference;
    readonly note: HandoffText | null;
    readonly freshnessText: string;
    readonly worksiteText: string | null;
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

export const utcMinuteText = (ms: number): string => `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')}Z`;

export const omittedTotal = (omitted: OmittedCounts): number => OMITTED_KINDS.reduce((sum, kind) => sum + omitted[kind], 0);

const omittedLine = (omitted: OmittedCounts): string =>
    `${omittedTotal(omitted)} facts omitted (${OMITTED_KINDS.map((kind) => `${kind} ${omitted[kind]}`).join(', ')})`;

const referenceLine = (reference: HandoffReference): string =>
    reference.kind === 'dry-run' ? 'Handoff reference: dry run' : `Handoff reference: ${utcMinuteText(reference.at)}-${reference.id.slice(-8)}`;

const entryLines = (group: HandoffGroup, entry: HandoffEntry): readonly string[] => [
    `- ${utcMinuteText(entry.lastAt)} ${entry.text}`,
    ...(entry.reason === null ? [] : [`  - ${group.id === 'closed' ? 'closed' : 'reason'}: ${entry.reason}`]),
];

const groupLines = (group: HandoffGroup): readonly string[] =>
    group.entries.length === 0 ? [] : ['', `## ${HEADINGS[group.id]}`, ...group.entries.flatMap((entry) => entryLines(group, entry))];

export function serializeHandoff(parts: HandoffParts): string {
    const note = parts.note === null ? [] : ['', `Note: ${parts.note}`];
    const omitted = omittedTotal(parts.omitted) === 0 ? [] : ['', omittedLine(parts.omitted)];
    const worksite = parts.worksiteText === null ? [] : ['', parts.worksiteText];
    return [
        HANDOFF_PREAMBLE,
        '',
        referenceLine(parts.reference),
        ...note,
        '',
        '## Freshness',
        parts.freshnessText,
        ...parts.groups.flatMap(groupLines),
        ...omitted,
        ...worksite,
    ].join('\n');
}
