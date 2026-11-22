import { isUnknownRead, type GuardedRecapRecords } from '#src/ports/guarded-reads.ts';
import { isScreenSource } from '#src/ports/screens.ts';
import type { LaneCursor } from '#src/ports/recap-records.ts';
import { isUnknown, type Unknown } from '#src/ports/unknowable.ts';
import { UNREAD, type Position, sourcePathOf, cursorOf } from '#src/ports/transcripts.ts';
import type { TranscriptRegistry } from '#src/ports/transcript-registry.ts';
import { newerPromptsOf, type Freshness, type RefreshStatus } from '#src/recap/domain/freshness.ts';
import type { LaneStatus } from '#src/recap/domain/status.ts';
import type { ClosedView } from './closed-view.ts';
import { TRANSCRIPT_READ_BUDGET_BYTES } from './transcript-read-budget.ts';
import { agentKind, tabId } from '#src/recap/domain/ids.ts';
import { textOf } from '#src/recap/domain/text.ts';

export interface FreshnessInput {
    readonly tab: string;
    readonly agent: string;
    readonly source: string | null;
    readonly cursor: LaneCursor | null;
    readonly status: LaneStatus;
    readonly refresh: RefreshStatus;
}

export type FreshnessOutcome = { readonly kind: 'fresh'; readonly freshness: Freshness } | { readonly kind: 'ledger-empty' } | { readonly kind: 'ledger-unreadable' };

export interface FreshnessDeps {
    readonly records: Pick<GuardedRecapRecords, 'lastRunOf'>;
    readonly transcripts: TranscriptRegistry;
    readonly unreported: (failure: Unknown) => void;
}

function positionOf(input: FreshnessInput): Position {
    const cursor = input.cursor;
    return cursor !== null && input.source !== null && cursor.transcript === input.source ? { cursor: cursorOf(cursor.cursor), tail: cursor.tail === null ? null : textOf(cursor.tail) } : UNREAD;
}

async function newerPromptCount(transcripts: TranscriptRegistry, input: FreshnessInput): Promise<number | null> {
    const source = input.source;
    const reader = source === null || isScreenSource(sourcePathOf(source)) ? undefined : transcripts.readerFor(agentKind(input.agent));
    if (source === null || reader === undefined) {
        return null;
    }
    const chunk = await reader.read(sourcePathOf(source), positionOf(input), TRANSCRIPT_READ_BUDGET_BYTES);
    return isUnknown(chunk) ? null : chunk.entries.filter((entry) => entry.role === 'user').length;
}

export function closedFreshnessOf(view: ClosedView): FreshnessOutcome {
    if (view.run === null) {
        return { kind: 'ledger-empty' };
    }
    return { kind: 'fresh', freshness: { lastRun: view.run, status: 'unknown', newerPrompts: { kind: 'unknown' }, refresh: 'not-requested' } };
}

export async function freshnessOf(deps: FreshnessDeps, input: FreshnessInput): Promise<FreshnessOutcome> {
    const lastRun = deps.records.lastRunOf(tabId(input.tab));
    if (lastRun === null) {
        return { kind: 'ledger-empty' };
    }
    if (isUnknownRead(lastRun)) {
        deps.unreported(lastRun);
        return { kind: 'ledger-unreadable' };
    }
    const count = await newerPromptCount(deps.transcripts, input);
    return { kind: 'fresh', freshness: { lastRun, status: input.status, newerPrompts: newerPromptsOf(count), refresh: input.refresh } };
}
