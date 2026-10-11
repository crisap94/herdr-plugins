import { isScreenSource } from '#src/ports/screens.ts';
import type { LaneCursor, RecapRecords } from '#src/ports/recap-records.ts';
import { isUnknown } from '#src/ports/unknowable.ts';
import { UNREAD, type Position } from '#src/ports/transcripts.ts';
import type { TranscriptRegistry } from '#src/ports/transcript-registry.ts';
import { newerPromptsOf, type Freshness, type RefreshStatus } from '#src/recap/domain/freshness.ts';
import type { LaneStatus } from '#src/recap/domain/status.ts';
import type { ClosedView } from './closed-lane-source.ts';
import { TRANSCRIPT_READ_BUDGET_BYTES } from './transcript-read-budget.ts';

export interface FreshnessInput {
    readonly tab: string;
    readonly agent: string;
    readonly source: string | null;
    readonly cursor: LaneCursor | null;
    readonly status: LaneStatus;
    readonly refresh: RefreshStatus;
}

export type FreshnessOutcome = { readonly kind: 'fresh'; readonly freshness: Freshness } | { readonly kind: 'ledger-empty' };

export interface FreshnessDeps {
    readonly records: Pick<RecapRecords, 'lastRunOf'>;
    readonly transcripts: TranscriptRegistry;
}

function positionOf(input: FreshnessInput): Position {
    const cursor = input.cursor;
    return cursor !== null && input.source !== null && cursor.transcript === input.source ? { cursor: cursor.cursor, tail: cursor.tail } : UNREAD;
}

async function newerPromptCount(transcripts: TranscriptRegistry, input: FreshnessInput): Promise<number | null> {
    const source = input.source;
    const reader = source === null || isScreenSource(source) ? undefined : transcripts.readerFor(input.agent);
    if (source === null || reader === undefined) {
        return null;
    }
    const chunk = await reader.read(source, positionOf(input), TRANSCRIPT_READ_BUDGET_BYTES);
    return isUnknown(chunk) ? null : chunk.entries.filter((entry) => entry.role === 'user').length;
}

export function closedFreshnessOf(view: ClosedView): FreshnessOutcome {
    if (view.run === null) {
        return { kind: 'ledger-empty' };
    }
    return { kind: 'fresh', freshness: { lastRun: view.run, status: 'unknown', newerPrompts: { kind: 'unknown' }, refresh: 'not-requested' } };
}

export async function freshnessOf(deps: FreshnessDeps, input: FreshnessInput): Promise<FreshnessOutcome> {
    const lastRun = deps.records.lastRunOf(input.tab);
    if (lastRun === null) {
        return { kind: 'ledger-empty' };
    }
    const count = await newerPromptCount(deps.transcripts, input);
    return { kind: 'fresh', freshness: { lastRun, status: input.status, newerPrompts: newerPromptsOf(count), refresh: input.refresh } };
}
