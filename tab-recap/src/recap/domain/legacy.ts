import { parseText, textOf, type Text } from './text.ts';
import { must, type Result } from '#src/protocol/result.ts';
import { instant, type Duration, type Instant } from './time.ts';
import type { ContextUse } from './compaction.ts';
import { parseCount, type Count } from './count.ts';
import type { Origin } from './origin.ts';
import { RUN_CAUSES, sessionFactsFrom, type AutocompactCounts, type RunCounts, type SessionFacts } from './session-facts.ts';
import type { Shape } from './board.ts';
import { parseByteBudget, type ByteBudget } from './byte-budget.ts';
import type { RestoredLane } from './closures.ts';
import type { CompactionLine, CompactionPlanResult, Confirmation, WhileWorking } from './compaction-plan.ts';
import { NOTE } from './coordination.ts';
import { STORY_TOO_LONG, STORY_WORDS, storyOf } from './curation.ts';
import type { FactId } from './fact.ts';
import type { Freshness } from './freshness.ts';
import type { HandoffGroupId } from './handoff-content.ts';
import type { HandoffText } from './handoff-sanitize.ts';
import type { WorksiteSnapshot } from './worksite.ts';
import type { PaneId, TabId } from './ids.ts';
import type { Lane, SeenLane } from './lane.ts';
import { collapsedText } from './text-collapse.ts';

export function numberIn(raw: string | undefined, min: number, max: number, whole = false): number | null {
    const text = (raw ?? '').trim().toLowerCase();
    const value = Number(text);
    const usable = text !== '' && Number.isFinite(value) && (!whole || Number.isInteger(value));
    return usable && value >= min && value <= max ? value : null;
}

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

export type FollowUp = { readonly kind: 'restore-message'; readonly acceptsStall: boolean } | { readonly kind: 'none' };

export interface CompactionPlan { readonly lines: readonly CompactionLine[]; readonly enterDelay: Duration; readonly confirm: Confirmation; readonly retryOnSelfFailure: boolean; readonly followUp: FollowUp; readonly whileWorking: WhileWorking; }

export type CompactionPlanFactory = (guidance: string) => CompactionPlanResult;

export interface NoteToken { readonly label: string; readonly value: string; }

export function notesOf(tokens: Readonly<Record<string, string>>): readonly NoteToken[] {
    return Object.keys(tokens).toSorted().flatMap((name): NoteToken[] => {
        const found = NOTE.exec(name);
        const value = collapsedText(textOf(tokens[name] ?? ''), 'space');
        return found === null || value === '' ? [] : [{ label: found[1] ?? 'note', value }];
    });
}

import { isObject, verdictOf, type Merge } from './twins/curation/legacy.ts';

export interface Curation { readonly merges: readonly Merge[]; readonly story: string | null; readonly refused: readonly string[]; }

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

export interface SeenColumn { readonly tabId: string; readonly paneId: string; readonly shape: Shape; }

export interface DeadColumn { readonly tab: TabId; readonly pane: PaneId }

export interface Reconciliation { readonly focusedTab?: string | null; readonly at?: number; readonly lanes: readonly SeenLane[]; readonly panes: readonly string[]; readonly columns: readonly SeenColumn[]; readonly widths: ReadonlyMap<string, number>; readonly tabs?: readonly TabId[]; readonly dead?: readonly DeadColumn[]; }

export interface StatusObservation { readonly kind: 'status'; readonly pane: PaneId; readonly status: string; }
export interface SessionObservation { readonly kind: 'session'; readonly pane: PaneId; readonly session: string; }
export interface ColumnOpenedObservation { readonly kind: 'column-opened'; readonly tab: TabId; readonly pane: PaneId; readonly shape: Shape; readonly at?: number; }
export interface SwitchedObservation { readonly kind: 'switched'; readonly enabled: boolean; }

function okOrNull<T, E>(parsed: Result<T, E>): T | null { return parsed.kind === 'ok' ? parsed.value : null; }

export interface SettleEvidence { readonly trials: number; readonly source: string; }

export interface HandoffEntry { readonly id: FactId; readonly text: HandoffText; readonly firstAt: number; readonly lastAt: number; readonly reason: HandoffText | null; }

export interface HandoffGroup { readonly id: HandoffGroupId; readonly entries: readonly HandoffEntry[]; readonly capped: number; }

export interface HandoffBody { readonly kind: 'content'; readonly note: HandoffText | null; readonly freshness: Freshness; readonly worksite: WorksiteSnapshot; readonly groups: readonly HandoffGroup[]; readonly withheld: number; }

export * from './twins/values/legacy.ts';

export { parseMerge, type Merge } from './twins/curation/legacy.ts';

interface SessionCompactionInput { readonly tokensBefore: number | null; readonly tokensAfter: number | null; readonly origin: Origin; }
interface SessionLaneInput { readonly agent: string; readonly label: string | null; readonly context: ContextUse | null; }
interface SessionWebInput { readonly base: string; readonly branch: string | null; }
interface SessionEditInput { readonly path: string; readonly count: number; }
interface SessionAutocompactInput { readonly decisions: number; readonly compacted: number; readonly waited: number; }

export interface SessionInputs { readonly firstSeen: number | null; readonly now: number; readonly runs: Readonly<Record<string, number>>; readonly compactions: readonly SessionCompactionInput[]; readonly lanes: readonly SessionLaneInput[]; readonly webs: readonly (SessionWebInput | null)[]; readonly edits: readonly SessionEditInput[]; readonly chapters?: number; readonly autocompact?: SessionAutocompactInput; }

const countIn = (raw: number | null | undefined): Count | null => (raw === null || raw === undefined ? null : okOrNull(parseCount(raw)));

const textIn = (raw: string): Text => must(parseText(raw));

function autocompactIn(counts: SessionAutocompactInput): AutocompactCounts | null {
    const [decisions, compacted, waited] = [countIn(counts.decisions), countIn(counts.compacted), countIn(counts.waited)];
    return decisions === null || compacted === null || waited === null ? null : { decisions, compacted, waited };
}

const runsIn = (runs: SessionInputs['runs']): RunCounts => Object.fromEntries(RUN_CAUSES.flatMap((cause) => { const count = countIn(runs[cause]); return count === null ? [] : [[cause, count]]; }));

export function sessionFactsOf(input: SessionInputs): SessionFacts {
    const chapters = countIn(input.chapters);
    const autocompact = input.autocompact === undefined ? null : autocompactIn(input.autocompact);
    return sessionFactsFrom({
        firstSeen: input.firstSeen === null ? null : instant(input.firstSeen), now: instant(input.now), runs: runsIn(input.runs),
        compactions: input.compactions.map((record) => ({ tokensBefore: countIn(record.tokensBefore), tokensAfter: countIn(record.tokensAfter), origin: record.origin })),
        lanes: input.lanes.map((lane) => ({ agent: textIn(lane.agent), label: lane.label === null ? null : textIn(lane.label), context: lane.context })),
        webs: input.webs.map((web) => (web === null ? null : { base: textIn(web.base), branch: web.branch === null ? null : textIn(web.branch) })),
        edits: input.edits.flatMap((edit) => { const count = countIn(edit.count); return count === null ? [] : [{ path: textIn(edit.path), count }]; }),
        ...(chapters === null ? {} : { chapters }), ...(autocompact === null ? {} : { autocompact }),
    });
}

