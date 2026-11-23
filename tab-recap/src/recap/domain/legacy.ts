import { parseText, type Text } from './text.ts';
import { must, type Result } from '#src/protocol/result.ts';
import { instant, type Instant } from './time.ts';
import type { ContextUse } from './compaction.ts';
import { parseCount, type Count } from './count.ts';
import type { Origin } from './origin.ts';
import { RUN_CAUSES, sessionFactsFrom, type AutocompactCounts, type RunCounts, type SessionFacts } from './session-facts.ts';
import type { Shape } from './board.ts';
import type { RestoredLane } from './closures.ts';
import type { PaneId, TabId } from './ids.ts';
import type { Lane, SeenLane } from './lane.ts';

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

export interface SeenColumn { readonly tabId: string; readonly paneId: string; readonly shape: Shape; }

export interface DeadColumn { readonly tab: TabId; readonly pane: PaneId }

export interface Reconciliation { readonly focusedTab?: string | null; readonly at?: number; readonly lanes: readonly SeenLane[]; readonly panes: readonly string[]; readonly columns: readonly SeenColumn[]; readonly widths: ReadonlyMap<string, number>; readonly tabs?: readonly TabId[]; readonly dead?: readonly DeadColumn[]; }

export interface StatusObservation { readonly kind: 'status'; readonly pane: PaneId; readonly status: string; }
export interface SessionObservation { readonly kind: 'session'; readonly pane: PaneId; readonly session: string; }
export interface ColumnOpenedObservation { readonly kind: 'column-opened'; readonly tab: TabId; readonly pane: PaneId; readonly shape: Shape; readonly at?: number; }
export interface SwitchedObservation { readonly kind: 'switched'; readonly enabled: boolean; }

function okOrNull<T, E>(parsed: Result<T, E>): T | null { return parsed.kind === 'ok' ? parsed.value : null; }

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

