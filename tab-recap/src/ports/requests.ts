import { err, ok, type Result } from '#src/protocol/result.ts';
import type { NewAsk } from '#src/ports/ask-ledger.ts';
import { parseHandoffId, parsePaneId, parseTabId, type HandoffId, type PaneId, type TabId } from '#src/recap/domain/ids.ts';
import type { HandoffSource } from '#src/recap/domain/handoff-source.ts';
import type { Origin } from '#src/recap/domain/origin.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { parseInstant, type Instant } from '#src/recap/domain/time.ts';
import type { ParseFailure } from '@stateforge-labs/session-ledger/unstable/recap/domain/parse-failure.ts';

export type {
    AnswerRow,
    CompactRequest,
    CompactionQueue,
    HandoffRequestRow,
    HandoffRequester,
    HandoffResponder,
    NewHandoffRequest,
    Requests,
    VisibilityRequest,
} from './twins/runs/legacy.ts';
export type { HandoffQueue } from './legacy.ts';

export type Visibility = 'hidden' | 'shown' | 'toggle';

export type RefreshFirst = 'refresh-first' | 'as-is';

export type Withdrawal = 'withdrawn' | 'not-found';

export type Queued = 'queued' | 'not-queued';

export interface VisibilityAsk {
    readonly target: PaneId;
    readonly visibility: Visibility;
}

export interface CompactAsk {
    readonly tab: TabId;
    readonly pane: PaneId | null;
    readonly note: Text | null;
    readonly origin?: Origin;
    readonly answer?: Text;
}

export interface HandoffAskRecord {
    readonly id: HandoffId;
    readonly at: Instant;
    readonly tab: TabId;
    readonly pane: PaneId;
    readonly toPane: PaneId;
    readonly refresh: RefreshFirst;
    readonly note: Text | null;
    readonly source: HandoffSource;
    readonly answer?: Text | null;
}

export interface HandoffAsk {
    readonly tab: TabId;
    readonly pane: PaneId;
    readonly toPane: PaneId;
    readonly note: Text | null;
    readonly refresh: RefreshFirst;
    readonly source: HandoffSource;
    readonly answer?: Text;
}

export interface HandoffAsker {
    requestHandoff(request: HandoffAsk): HandoffId;
    withdrawHandoff(id: HandoffId): Withdrawal;
}

export interface HandoffAskQueue {
    queueHandoff(ask: NewAsk, request: HandoffAsk): void;
}

export interface HandoffTaker {
    takeHandoffs(): readonly HandoffAskRecord[];
}

export interface AnsweredPane {
    readonly pane: PaneId;
    readonly answer: Text;
}

export interface RequestPort extends HandoffAsker, HandoffTaker {
    request(tab: TabId): void;
    requestVisibility(request: VisibilityAsk): void;
    requestCompact(request: CompactAsk): void;
    requestCurate(tab: TabId): void;
    takeRequests(): readonly TabId[];
    takeVisibility(): readonly VisibilityAsk[];
    takeCompactions(): readonly CompactAsk[];
    takeCurations(): readonly TabId[];
    takeAnswered(): readonly AnsweredPane[];
}

export interface CompactionAskQueue {
    compactQueued(tab: TabId, pane: PaneId): Queued;
}

type Row = Record<string, unknown>;

const isRow = (input: unknown): input is Row => typeof input === 'object' && input !== null;

const VISIBILITIES: readonly Visibility[] = ['hidden', 'shown', 'toggle'];

const REFRESHES: readonly RefreshFirst[] = ['refresh-first', 'as-is'];

const ORIGINS: readonly Origin[] = ['operator', 'auto', 'request'];

function sourceOf(row: Row): Result<HandoffSource, ParseFailure> {
    if (row.kind === 'live') return ok({ kind: 'live' });
    if (row.kind !== 'closed') return err({ kind: 'out-of-range' });
    const closedAt = parseInstant(row.closedAt);
    if (closedAt.kind === 'err') return closedAt;
    return ok({ kind: 'closed', closedAt: closedAt.value });
}

export function parseVisibilityAsk(input: unknown): Result<VisibilityAsk, ParseFailure> {
    if (!isRow(input)) return err({ kind: 'not-a-row' });
    const target = parsePaneId(input.target);
    if (target.kind === 'err') return target;
    const visibility = VISIBILITIES.find((option) => option === input.visibility);
    if (visibility === undefined) return err({ kind: 'out-of-range' });
    return ok({ target: target.value, visibility });
}

export function parseCompactAsk(input: unknown): Result<CompactAsk, ParseFailure> {
    if (!isRow(input)) return err({ kind: 'not-a-row' });
    const tab = parseTabId(input.tab);
    if (tab.kind === 'err') return tab;
    const pane = input.pane === null ? ok(null) : parsePaneId(input.pane);
    if (pane.kind === 'err') return pane;
    const note = input.note === null ? ok(null) : parseText(input.note);
    if (note.kind === 'err') return note;
    const origin = ORIGINS.find((option) => option === input.origin);
    if (input.origin !== undefined && origin === undefined) return err({ kind: 'out-of-range' });
    const answer = input.answer === undefined ? ok(undefined) : parseText(input.answer);
    if (answer.kind === 'err') return answer;
    return ok({
        tab: tab.value,
        pane: pane.value,
        note: note.value,
        ...(origin === undefined ? {} : { origin }),
        ...(answer.value === undefined ? {} : { answer: answer.value }),
    });
}

export function parseHandoffAskRecord(input: unknown): Result<HandoffAskRecord, ParseFailure> {
    if (!isRow(input)) return err({ kind: 'not-a-row' });
    const id = parseHandoffId(input.id);
    if (id === null) return err({ kind: 'out-of-range' });
    const at = parseInstant(input.at);
    if (at.kind === 'err') return at;
    const tab = parseTabId(input.tab);
    if (tab.kind === 'err') return tab;
    const pane = parsePaneId(input.pane);
    if (pane.kind === 'err') return pane;
    const toPane = parsePaneId(input.toPane);
    if (toPane.kind === 'err') return toPane;
    const refresh = REFRESHES.find((option) => option === input.refresh);
    if (refresh === undefined) return err({ kind: 'out-of-range' });
    const note = input.note === null ? ok(null) : parseText(input.note);
    if (note.kind === 'err') return note;
    const sourceRow = input.source;
    const source: Result<HandoffSource, ParseFailure> = isRow(sourceRow) ? sourceOf(sourceRow) : err({ kind: 'not-a-row' });
    if (source.kind === 'err') return source;
    const answerRow = input.answer;
    const answer = answerRow === undefined || answerRow === null ? ok(answerRow) : parseText(answerRow);
    if (answer.kind === 'err') return answer;
    return ok({
        id,
        at: at.value,
        tab: tab.value,
        pane: pane.value,
        toPane: toPane.value,
        refresh,
        note: note.value,
        source: source.value,
        ...(answer.value === undefined ? {} : { answer: answer.value }),
    });
}
