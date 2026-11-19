import type { ParsedValue } from '#src/protocol/codec.ts';
import { BACKEND_IDS, harnessLabels, type BackendChoice, type BackendId } from '@stateforge-labs/session-ledger/unstable/recap/domain/backend.ts';
import { parseText, type Text } from '@stateforge-labs/session-ledger/unstable/recap/domain/text.ts';
import type { Milliseconds } from '@stateforge-labs/session-ledger/unstable/recap/domain/time.ts';
import { placementFor, judgeSettingOf, compactSettingOf, curateSettingOf, deciderSettingOf, keepDaysCountOf } from './job.ts';
import type { DeciderBy, JobAnswer, JobBy, JobPlacement, JobReader } from './job.ts';
import type { Effort } from './effort.ts';
import { COMPACT_FAILURES, COMPACT_STAGES, type CompactFailure } from '#src/protocol/exchanges/compact.ts';
import { failureStage, isFailureStage } from '#src/protocol/exchange.ts';
import type { RequestId } from '#src/protocol/primitives.ts';
import { must, type Result } from '#src/protocol/result.ts';
import { kindsWith, type RegisteredKind, type RegisteredKindTable } from '@stateforge-labs/session-ledger/unstable/recap/domain/registered-kinds.ts';
import type { Flight } from '@stateforge-labs/session-ledger/unstable/recap/domain/in-flight.ts';
import type { Duration, Instant } from '@stateforge-labs/session-ledger/unstable/recap/domain/time.ts';
import type { AskOutcome } from './ask-outcome.ts';
import type { AutocompactKinds, AutocompactSetting, JevSetting, LaneKind } from './autocompact.ts';
import type { AutocompactStyle } from './autocompact-style.ts';
import type { Thresholds } from './autocompact-verdict.ts';
import { BACKOFF_BASE_MS, BACKOFF_MAX_MS } from './backoff.ts';
import type { Shape } from './board.ts';
import { parseByteBudget, type ByteBudget } from './byte-budget.ts';
import type { RestoredLane } from './closures.ts';
import { VALUE_MAX as NOTE_MAX } from './compact-request.ts';
import { NotAReasonError, parseCompactionPiece, parseConfirmationReads, parseNeedsIdleReason, type CompactionLine, type CompactionPiece, type CompactionPlanResult, type Confirmation, type ConfirmationReads, type WhileWorking } from './compaction-plan.ts';
import { NOTE } from './coordination.ts';
import { STORY_TOO_LONG, STORY_WORDS, storyOf } from './curation.ts';
import { VALUE_MAX as EVENT_MAX, type EventKind } from './event-token.ts';
import type { FactId } from '@stateforge-labs/session-ledger/unstable/recap/domain/fact.ts';
import type { Freshness, LastRunCause, RefreshStatus, WaitResult } from './freshness.ts';
import type { HandoffGroupId } from './handoff-content.ts';
import { cleanHandoffText, type HandoffText } from './handoff-sanitize.ts';
import { vetHandoffText } from './handoff-vetting.ts';
import { herdrEventsFrom, type HerdrEvents } from './herdr-events.ts';
import { parseHandoffOutcome, parseStoredHandoffOutcome, type HandoffOutcome, type StoredHandoffOutcome } from './handoff-outcome.ts';
import type { WorksiteSnapshot } from './worksite.ts';
import { NotAnIdentifierError, isUncheckedSessionId, isUncheckedSessionPath, parseAgentKind, parseHandoffId, parsePaneId, parseSessionId, parseSessionPath, parseTabId, parseWorkspaceId, type HandoffId, type PaneId, type SessionId, type SessionPath, type AgentKind, type TabId, type WorkspaceId } from './ids.ts';
import type { Lane, SeenLane } from './lane.ts';
import { collapsedText } from './text-collapse.ts';

export function outcomeText(outcome: AskOutcome): string { return outcome.kind === 'failed' ? failureStage(outcome.reason) : outcome.kind; }

export type TuningReader = (key: string) => string | undefined;

export interface AutocompactTuning { readonly style: AutocompactStyle; readonly verdict: Thresholds; readonly coverageAtLeast: number; readonly recheckIdleMs: number | null; }

export function numberIn(raw: string | undefined, min: number, max: number, whole = false): number | null {
    const text = (raw ?? '').trim().toLowerCase();
    const value = Number(text);
    const usable = text !== '' && Number.isFinite(value) && (!whole || Number.isInteger(value));
    return usable && value >= min && value <= max ? value : null;
}

export function autocompactDefaultKinds<T extends RegisteredKindTable>(table: T): readonly (keyof T)[] { return kindsWith(table, 'autocompactDefault'); }

export type AutocompactReader = (key: AutocompactSetting) => string | undefined;

export type JevReader = (key: JevSetting) => string | undefined;

export interface GateInput { readonly kind: LaneKind; readonly kinds: AutocompactKinds; readonly shadowKinds: readonly RegisteredKind[]; readonly busy: boolean; readonly flight: Flight | null; readonly share: number; readonly minimum: number; readonly ceiling: number; readonly now: number; readonly lastBreakAt: number | null; readonly lastDecisionAt: Instant | null; readonly cooldownMs: number; readonly unchanged: boolean; readonly coverageBackoff?: boolean; }

export function backoffMs(failures: number): number { return failures <= 0 ? 0 : Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (failures - 1)); }

export interface Placement { readonly pane: PaneId; readonly shape: Shape; readonly since?: number; }

export interface HiddenState { readonly all: boolean; readonly hidden: readonly string[]; readonly shown: readonly string[]; }

export interface Board { readonly lanes: ReadonlyMap<PaneId, Lane>; readonly columns: ReadonlyMap<TabId, Placement>; readonly closing: ReadonlyMap<PaneId, Instant>; readonly opening: ReadonlySet<TabId>; readonly reopens: ReadonlyMap<TabId, readonly Instant[]>; readonly givenUp: ReadonlyMap<TabId, Instant>; readonly widths: ReadonlyMap<TabId, number>; readonly focused: TabId | null; readonly enabled: boolean; readonly seeded: boolean; readonly hidden: ReadonlySet<TabId>; readonly allHidden: boolean; readonly shown: ReadonlySet<TabId>; readonly persisted: readonly RestoredLane[] | null; }

export function listsPane(board: Board, pane: PaneId): boolean { return board.lanes.has(pane); }

export function byteBudgetOf(bytes: number): ByteBudget {
    const budget = parseByteBudget(bytes);
    if (budget.kind === 'err') {
        throw new RangeError('a byte budget is a positive integer');
    }
    return budget.value;
}

export function fits(budget: ByteBudget, bytes: number): boolean { return bytes <= budget; }

function fitNote(id: RequestId, note: string): string | null { return note.trim() === '' ? null : note.slice(0, NOTE_MAX - id.length - 1); }

export function noteOf(value: ParsedValue): string | null {
    const note = value['note'];
    return typeof note === 'string' ? fitNote(value.id, note) : null;
}

export function finalAnswerOf(stage: string, reason: CompactFailure | null): string { return stage === 'compacted' ? COMPACT_STAGES.done : failureStage(reason ?? (stage === 'skipped' ? COMPACT_FAILURES.skipped : COMPACT_FAILURES.error)); }

export function isTerminalStage(stage: string): boolean { return stage === COMPACT_STAGES.done || isFailureStage(stage); }

export type Unsupported = { readonly kind: 'unsupported'; readonly why: string };

export function unsupported(why: string): Unsupported { return { kind: 'unsupported', why }; }

export function compactionPiece(text: string): CompactionPiece { return must(parseCompactionPiece(text)); }

export function confirmationReads(reads: number): ConfirmationReads { return must(parseConfirmationReads(reads)); }

export function needsIdle(reason: string): WhileWorking {
    if (reason.trim() === '') {
        throw new NotAReasonError('a kind that needs the lane idle must say why');
    }
    return { kind: 'needs-idle', reason: must(parseNeedsIdleReason(reason)) };
}

export type FollowUp = { readonly kind: 'restore-message'; readonly acceptsStall: boolean } | { readonly kind: 'none' };

export interface CompactionPlan { readonly lines: readonly CompactionLine[]; readonly enterDelay: Duration; readonly confirm: Confirmation; readonly retryOnSelfFailure: boolean; readonly followUp: FollowUp; readonly whileWorking: WhileWorking; }

export type CompactionPlanFactory = (guidance: string) => CompactionPlanResult;

export interface NoteToken { readonly label: string; readonly value: string; }

export function plainText(raw: string): string { return collapsedText(raw, 'space'); }

export function notesOf(tokens: Readonly<Record<string, string>>): readonly NoteToken[] {
    return Object.keys(tokens).toSorted().flatMap((name): NoteToken[] => {
        const found = NOTE.exec(name);
        const value = plainText(tokens[name] ?? '');
        return found === null || value === '' ? [] : [{ label: found[1] ?? 'note', value }];
    });
}

export interface Merge { readonly id: string; readonly into: string; }

export interface Curation { readonly merges: readonly Merge[]; readonly story: string | null; readonly refused: readonly string[]; }

function isObject(value: unknown): value is Readonly<Record<string, unknown>> { return typeof value === 'object' && value !== null && !Array.isArray(value); }

interface Merged { readonly ids: ReadonlySet<string>; readonly targets: ReadonlySet<string>; }

function closeRefusal(op: Readonly<Record<string, unknown>>, open: ReadonlySet<string>, merged: Merged): string | null {
    const [id, into] = [op['id'], op['into']];
    if (op['why'] !== 'merged' || typeof into !== 'string') {
        return `close ${String(id)} must say why "merged" and the fact it merges into`;
    }
    if (typeof id !== 'string' || !open.has(id) || merged.ids.has(id)) {
        return `${String(id)} is not an open fact (or is already merged)`;
    }
    if (merged.targets.has(id)) {
        return `${id} is where another fact was merged: it stays open`;
    }
    return id === into || !open.has(into) || merged.ids.has(into) ? `${id} cannot merge into ${into}` : null;
}

function refusal(op: unknown, open: ReadonlySet<string>, merged: Merged): string | null {
    if (!isObject(op)) {
        return 'not an operation';
    }
    return op['op'] === 'close' ? closeRefusal(op, open, merged) : `${String(op['op'])} is not allowed: the curator may only close`;
}

export function parseMerge(op: unknown): Merge | null { return isObject(op) && typeof op['id'] === 'string' && typeof op['into'] === 'string' ? { id: op['id'], into: op['into'] } : null; }

function verdictOf(op: unknown, open: ReadonlySet<string>, merged: Merged): Merge | string { return refusal(op, open, merged) ?? parseMerge(op) ?? 'not an operation'; }

export function curationOf(answer: string, open: ReadonlySet<string>): Curation {
    let parsed: unknown;
    try {
        parsed = JSON.parse(answer);
    } catch {
        return { merges: [], story: null, refused: ['the answer is not JSON'] };
    }
    if (!isObject(parsed)) {
        return { merges: [], story: null, refused: ['the answer is not an object'] };
    }
    const ops: readonly unknown[] = Array.isArray(parsed['ops']) ? parsed['ops'] : [];
    const merges: Merge[] = [];
    const refused: string[] = [];
    for (const op of ops) {
        const verdict = verdictOf(op, open, { ids: new Set(merges.map((merge) => merge.id)), targets: new Set(merges.map((merge) => merge.into)) });
        if (typeof verdict === 'string') {
            refused.push(verdict);
        } else {
            merges.push(verdict);
        }
    }
    const said = parsed['story'];
    const count = typeof said === 'string' ? said.trim().split(/\s+/u).length : 0;
    if (count > STORY_WORDS) {
        refused.push(`${STORY_TOO_LONG}: ${count} words, at most ${STORY_WORDS}`);
    }
    return { merges, story: storyOf(said), refused };
}

export function seqOf(startedAt: number, n: number): string { return (Math.floor(startedAt) + n).toString(36); }

export function eventValue(seq: string, kind: EventKind, detail?: string | null): string {
    const tail = detail === undefined || detail === null || detail === '' ? '' : `:${detail}`;
    return `${seq}:${kind}${tail}`.slice(0, EVENT_MAX);
}

export interface SeenColumn { readonly tabId: string; readonly paneId: string; readonly shape: Shape; }

export interface Reconciliation { readonly focusedTab?: string | null; readonly at?: number; readonly lanes: readonly SeenLane[]; readonly panes: readonly string[]; readonly columns: readonly SeenColumn[]; readonly widths: ReadonlyMap<string, number>; readonly tabs?: readonly TabId[]; }

export interface StatusObservation { readonly kind: 'status'; readonly pane: PaneId; readonly status: string; }
export interface SessionObservation { readonly kind: 'session'; readonly pane: PaneId; readonly session: string; }
export interface ColumnOpenedObservation { readonly kind: 'column-opened'; readonly tab: TabId; readonly pane: PaneId; readonly shape: Shape; readonly at?: number; }
export interface SwitchedObservation { readonly kind: 'switched'; readonly enabled: boolean; }

function okOrNull<T, E>(parsed: Result<T, E>): T | null { return parsed.kind === 'ok' ? parsed.value : null; }

function orThrow<T>(value: T | null, why: string): T {
    if (value === null) {
        throw new NotAnIdentifierError(why);
    }
    return value;
}

export function paneId(raw: string): PaneId { return orThrow(okOrNull(parsePaneId(raw)), 'a pane id cannot be empty'); }

export function tabId(raw: string): TabId { return orThrow(okOrNull(parseTabId(raw)), 'a tab id cannot be empty'); }

export function workspaceId(raw: string): WorkspaceId { return orThrow(okOrNull(parseWorkspaceId(raw)), 'a workspace id cannot be empty'); }

export function sessionId(raw: string): SessionId { return orThrow(okOrNull(parseSessionId(raw)), 'a session id cannot be empty'); }

export function sessionIdFromAgentValue(raw: string): SessionId { return orThrow(isUncheckedSessionId(raw) ? raw : null, 'a session id cannot be empty'); }

export function sessionPath(raw: string): SessionPath { return orThrow(okOrNull(parseSessionPath(raw)), 'a session path cannot be empty'); }

export function sessionPathFromAgentValue(raw: string): SessionPath { return orThrow(isUncheckedSessionPath(raw) ? raw : null, 'a session path cannot be empty'); }

export function handoffId(raw: string): HandoffId { return orThrow(parseHandoffId(raw), 'a handoff id must be a TypeID: hnd_ and 26 base32 characters'); }

export function agentKind(raw: string): AgentKind { return orThrow(okOrNull(parseAgentKind(raw)), 'an agent kind cannot be empty'); }

export interface LastRun { readonly at: number; readonly cause: LastRunCause; }

export type NewerPrompts = { readonly kind: 'none' } | { readonly kind: 'at-least'; readonly count: number } | { readonly kind: 'unknown' };

export function refreshStatusOf(waited: WaitResult, error: string | null): RefreshStatus {
    if (waited === 'timeout') {
        return 'timed-out';
    }
    return error === null ? 'refreshed' : 'failed';
}

export function newerPromptsOf(count: number | null): NewerPrompts {
    if (count === null) {
        return { kind: 'unknown' };
    }
    return count > 0 ? { kind: 'at-least', count } : { kind: 'none' };
}

export interface SettleEvidence { readonly trials: number; readonly source: string; }

export interface HandoffEntry { readonly id: FactId; readonly text: HandoffText; readonly firstAt: number; readonly lastAt: number; readonly reason: HandoffText | null; }

export interface HandoffGroup { readonly id: HandoffGroupId; readonly entries: readonly HandoffEntry[]; readonly capped: number; }

export interface HandoffBody { readonly kind: 'content'; readonly note: HandoffText | null; readonly freshness: Freshness; readonly worksite: WorksiteSnapshot; readonly groups: readonly HandoffGroup[]; readonly withheld: number; }

export interface Job { readonly by: JobBy; readonly model: string; readonly effort: Effort; readonly timeoutMs?: Milliseconds; readonly answer?: JobAnswer; }

export interface DeciderJob { readonly by: DeciderBy; readonly model: string; readonly effort: Effort; }

export interface RecapChoices { readonly backend: BackendChoice; readonly models: Readonly<Record<BackendId, string>>; }

const textValue = (raw: string | undefined): Text | undefined => (raw === undefined ? undefined : must(parseText(raw)));

const readerOf = (get: TuningReader): JobReader => (key) => textValue(get(key));

export const judgeJobOf = (get: TuningReader): Job => judgeSettingOf(readerOf(get));

export const compactJobOf = (get: TuningReader): Job => compactSettingOf(readerOf(get));

export const curateJobOf = (get: TuningReader): Job => curateSettingOf(readerOf(get));

export const deciderJobOf = (get: TuningReader): DeciderJob => deciderSettingOf(readerOf(get));

export function keepDaysOf(raw: string | undefined): number { return keepDaysCountOf(textValue(raw)); }

export function placementOf(job: Job, recap: RecapChoices, available: readonly string[]): JobPlacement | null {
    return placementFor(
        { ...job, model: must(parseText(job.model)) },
        { backend: recap.backend, models: harnessLabels((id) => must(parseText(recap.models[id]))) },
        available.filter((id): id is BackendId => BACKEND_IDS.some((known) => known === id)),
    );
}

export const sanitizeHandoffText = (raw: string): HandoffText => cleanHandoffText(must(parseText(raw)));

export const isForbidden = (text: HandoffText): boolean => vetHandoffText(text).kind === 'err';

export const herdrEventsOf = (raw: string | undefined): HerdrEvents => herdrEventsFrom(textValue(raw));

export * from './twins/values/legacy.ts';

export const handoffOutcomeOf = (kind: string, reason: string | null): HandoffOutcome | null => okOrNull(parseHandoffOutcome(kind, reason));

export const storedOutcomeOf = (kind: string, reason: string | null): StoredHandoffOutcome | null => okOrNull(parseStoredHandoffOutcome(kind, reason));
