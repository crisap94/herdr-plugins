import { err, ok, type Result } from '#src/protocol/result.ts';
import type { AskDraft } from '#src/ports/ask-ledger.ts';
import { parseHandoffId, parsePaneId, parseTabId, type HandoffId, type SessionKey, type ScopeId } from '#src/recap/domain/ids.ts';
import type { HandoffSource } from '#src/recap/domain/handoff-source.ts';
import type { Origin } from '#src/recap/domain/origin.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { parseInstant, type Instant } from '#src/recap/domain/time.ts';
import type { ParseFailure } from '@stateforge-labs/session-ledger/unstable/recap/domain/parse-failure.ts';

export type Visibility = 'hidden' | 'shown' | 'toggle';

export type RefreshFirst = 'refresh-first' | 'as-is';

export type Withdrawal = 'withdrawn' | 'not-found';

export type Queued = 'queued' | 'not-queued';

export interface VisibilityAsk {
    readonly target: SessionKey;
    readonly visibility: Visibility;
}

export interface CompactAsk {
    readonly tab: ScopeId;
    readonly pane: SessionKey | null;
    readonly note: Text | null;
    readonly origin?: Origin;
    readonly answer?: Text;
}

export interface HandoffAskRecord {
    readonly id: HandoffId;
    readonly at: Instant;
    readonly tab: ScopeId;
    readonly pane: SessionKey;
    readonly toPane: SessionKey;
    readonly refresh: RefreshFirst;
    readonly note: Text | null;
    readonly source: HandoffSource;
    readonly answer?: Text | null;
}

export interface HandoffAsk {
    readonly tab: ScopeId;
    readonly pane: SessionKey;
    readonly toPane: SessionKey;
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
    queueHandoff(ask: AskDraft, request: HandoffAsk): void;
}

export interface HandoffTaker {
    takeHandoffs(): readonly HandoffAskRecord[];
}

export interface AnsweredPane {
    readonly pane: SessionKey;
    readonly answer: Text;
}

export interface RequestPort extends HandoffAsker, HandoffTaker {
    request(tab: ScopeId): void;
    requestVisibility(request: VisibilityAsk): void;
    requestCompact(request: CompactAsk): void;
    requestCurate(tab: ScopeId): void;
    takeRequests(): readonly ScopeId[];
    takeVisibility(): readonly VisibilityAsk[];
    takeCompactions(): readonly CompactAsk[];
    takeCurations(): readonly ScopeId[];
    takeAnswered(): readonly AnsweredPane[];
}

export interface CompactionAskQueue {
    compactQueued(tab: ScopeId, pane: SessionKey): Queued;
}

type Row = Record<string, unknown>;

const isRow = (input: unknown): input is Row => typeof input === 'object' && input !== null;

const VISIBILITIES: readonly Visibility[] = ['hidden', 'shown', 'toggle'];

const REFRESHES: readonly RefreshFirst[] = ['refresh-first', 'as-is'];

const ORIGINS: readonly Origin[] = ['operator', 'auto', 'request'];

function paneOf(row: Row): Result<SessionKey | null, ParseFailure> {
    return row.pane === null ? ok(null) : parsePaneId(row.pane);
}

function noteOf(row: Row): Result<Text | null, ParseFailure> {
    return row.note === null ? ok(null) : parseText(row.note);
}

function originOf(row: Row): Result<Origin | undefined, ParseFailure> {
    const origin = ORIGINS.find((option) => option === row.origin);
    return row.origin !== undefined && origin === undefined ? err({ kind: 'out-of-range' }) : ok(origin);
}

function answerOf(row: Row): Result<Text | null | undefined, ParseFailure> {
    return row.answer === undefined || row.answer === null ? ok(row.answer) : parseText(row.answer);
}

function compactAnswerOf(row: Row): Result<Text | undefined, ParseFailure> {
    return row.answer === undefined || row.answer === null ? ok(undefined) : parseText(row.answer);
}

function refreshOf(row: Row): Result<RefreshFirst, ParseFailure> {
    const refresh = REFRESHES.find((option) => option === row.refresh);
    return refresh === undefined ? err({ kind: 'out-of-range' }) : ok(refresh);
}

function idOf(row: Row): Result<HandoffId, ParseFailure> {
    const id = parseHandoffId(row.id);
    return id === null ? err({ kind: 'out-of-range' }) : ok(id);
}

function sourceOf(row: Row): Result<HandoffSource, ParseFailure> {
    const source = row.source;
    if (!isRow(source)) return err({ kind: 'not-a-row' });
    if (source.kind === 'live') return ok({ kind: 'live' });
    if (source.kind !== 'closed') return err({ kind: 'out-of-range' });
    const closedAt = parseInstant(source.closedAt);
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
    const pane = paneOf(input);
    if (pane.kind === 'err') return pane;
    const note = noteOf(input);
    if (note.kind === 'err') return note;
    const origin = originOf(input);
    if (origin.kind === 'err') return origin;
    const answer = compactAnswerOf(input);
    if (answer.kind === 'err') return answer;
    return ok({
        tab: tab.value,
        pane: pane.value,
        note: note.value,
        ...(origin.value === undefined ? {} : { origin: origin.value }),
        ...(answer.value === undefined ? {} : { answer: answer.value }),
    });
}

type HandoffPlace = Pick<HandoffAskRecord, 'id' | 'at' | 'tab' | 'pane' | 'toPane'>;

function placeOf(input: Row): Result<HandoffPlace, ParseFailure> {
    const id = idOf(input);
    if (id.kind === 'err') return id;
    const at = parseInstant(input.at);
    if (at.kind === 'err') return at;
    const tab = parseTabId(input.tab);
    if (tab.kind === 'err') return tab;
    const pane = parsePaneId(input.pane);
    if (pane.kind === 'err') return pane;
    const toPane = parsePaneId(input.toPane);
    if (toPane.kind === 'err') return toPane;
    return ok({ id: id.value, at: at.value, tab: tab.value, pane: pane.value, toPane: toPane.value });
}

export function parseHandoffAskRecord(input: unknown): Result<HandoffAskRecord, ParseFailure> {
    if (!isRow(input)) return err({ kind: 'not-a-row' });
    const place = placeOf(input);
    if (place.kind === 'err') return place;
    const refresh = refreshOf(input);
    if (refresh.kind === 'err') return refresh;
    const note = noteOf(input);
    if (note.kind === 'err') return note;
    const source = sourceOf(input);
    if (source.kind === 'err') return source;
    const answer = answerOf(input);
    if (answer.kind === 'err') return answer;
    return ok({
        ...place.value,
        refresh: refresh.value,
        note: note.value,
        source: source.value,
        ...(answer.value === undefined ? {} : { answer: answer.value }),
    });
}
