import { err, ok, type Result } from '#src/protocol/result.ts';
import type { BoundaryKind, Trigger } from './boundary.ts';
import type { WindowSource } from './compaction.ts';
import type { Count } from './count.ts';
import type { ClosedWhy, Section } from './fact.ts';
import type { PaneId } from './ids.ts';
import type { ParseFailure } from './parse-failure.ts';
import type { Origin } from './origin.ts';
import type { RunCause } from './session-facts.ts';
import type { NonEmptyText, Text } from './text.ts';
import type { Instant } from './time.ts';

export type Flag = 'yes' | 'no';
export const YES: Flag = 'yes';
export const NO: Flag = 'no';
const STAGE_IDS: readonly GuiStageId[] = ['briefing', 'compacting', 'restoring', 'compacted', 'failed', 'unconfirmed', 'skipped'];

export const parseFlag = (input: unknown): Flag => (input === YES ? YES : NO);

export type GuiLocale = 'en' | 'es';
export type GuiForge = 'gitlab' | 'github';
export type GuiFactState = 'open' | 'closed';
export type GuiNoteKind = 'alert' | 'git' | 'token' | 'extension';
export type GuiStageId = 'briefing' | 'compacting' | 'restoring' | 'compacted' | 'failed' | 'unconfirmed' | 'skipped';
export function parseGuiStageId(input: unknown): Result<GuiStageId, ParseFailure> {
    const found = STAGE_IDS.find((stage) => stage === input);
    return found === undefined ? err({ kind: 'out-of-range' }) : ok(found);
}

export type GuiBrief = 'written' | 'template';
export type GuiCutPart = 'timeline' | 'markdown' | 'text' | 'decisions' | 'prompt' | 'facts';

export interface GuiSpan {
    readonly text: Text;
    readonly url: Text | null;
}

export interface GuiFact {
    readonly id: NonEmptyText;
    readonly section: Section;
    readonly text: Text;
    readonly spans: readonly GuiSpan[] | null;
    readonly why: Text | null;
    readonly ref: Text | null;
    readonly agent: Text | null;
    readonly firstAt: Instant;
    readonly lastAt: Instant;
    readonly state: GuiFactState;
    readonly closedWhy: ClosedWhy | null;
    readonly closedAt: Instant | null;
}

export interface GuiRegions {
    readonly goal: readonly NonEmptyText[];
    readonly now: readonly NonEmptyText[];
    readonly needs: readonly NonEmptyText[];
    readonly decisions: readonly NonEmptyText[];
    readonly next: readonly NonEmptyText[];
    readonly rules: readonly NonEmptyText[];
    readonly links: readonly NonEmptyText[];
}

export interface GuiBreak {
    readonly kind: BoundaryKind;
    readonly at: Instant;
    readonly trigger: Trigger | null;
    readonly tokensBefore: Count | null;
    readonly tokensAfter: Count | null;
    readonly tookMs: Count | null;
    readonly text: Text;
}

export interface GuiFactRow {
    readonly kind: 'fact';
    readonly fact: NonEmptyText;
    readonly at: Instant;
    readonly clock: Text;
    readonly day: Text | null;
    readonly closed: ClosedWhy | null;
}

export interface GuiBreakRow {
    readonly kind: 'break';
    readonly at: Instant;
    readonly clock: Text;
    readonly day: Text | null;
    readonly break: GuiBreak;
}

export type GuiTimelineRow = GuiFactRow | GuiBreakRow;

export interface GuiStory {
    readonly text: Text;
    readonly spans: readonly GuiSpan[] | null;
    readonly at: Instant;
}

export interface GuiCut {
    readonly part: GuiCutPart;
    readonly task: NonEmptyText | null;
    readonly kept: Count;
    readonly total: Count;
}

export interface GuiGroup {
    readonly task: NonEmptyText | null;
    readonly lanes: readonly PaneId[];
}

export interface GuiVersions {
    readonly plugin: Text | null;
    readonly daemon: Text | null;
    readonly stale: Flag;
}

export interface GuiContext {
    readonly tokens: Count;
    readonly window: Count;
    readonly share: Count;
    readonly source: WindowSource;
}

export interface GuiHint {
    readonly percent: Count;
    readonly window: Count;
}

export interface GuiStage {
    readonly id: NonEmptyText;
    readonly stage: GuiStageId;
    readonly queued: Flag;
    readonly writer: Text | null;
    readonly brief: GuiBrief | null;
    readonly why: Text | null;
    readonly startedAt: Instant;
    readonly stageAt: Instant;
    readonly tokensBefore: Count | null;
    readonly tokensAfter: Count | null;
    readonly tookMs: Count | null;
    readonly origin: Origin;
    readonly text: Text;
}

export interface GuiCompaction {
    readonly hint: GuiHint | null;
    readonly stage: GuiStage | null;
}

export interface GuiNote {
    readonly mark: Text;
    readonly label: Text;
    readonly at: Instant | null;
    readonly details: readonly Text[];
    readonly kind: GuiNoteKind;
}

export interface GuiGit {
    readonly branch: Text;
    readonly ahead: Count | null;
    readonly changed: Count;
}

export interface GuiWeb {
    readonly base: Text;
    readonly forge: GuiForge;
    readonly branch: Text | null;
}

export interface GuiCauseCount {
    readonly cause: RunCause;
    readonly count: Count;
}

export interface GuiRuns {
    readonly total: Count;
    readonly byCause: readonly GuiCauseCount[];
}

export interface GuiOrigins {
    readonly operator: Count;
    readonly auto: Count;
}

export interface GuiMeasured {
    readonly before: Count;
    readonly after: Count;
}

export interface GuiCompactions {
    readonly count: Count;
    readonly byOrigin: GuiOrigins;
    readonly measured: readonly GuiMeasured[];
}

export interface GuiAgentShare {
    readonly label: Text;
    readonly share: Count;
    readonly window: Count;
}

export interface GuiFileCount {
    readonly path: Text;
    readonly count: Count;
}

export interface GuiAutocompact {
    readonly decisions: Count;
    readonly compacted: Count;
    readonly waited: Count;
}

export interface GuiStarted {
    readonly at: Instant;
    readonly forMs: Count;
}

export interface GuiRepo {
    readonly name: Text;
    readonly branch: Text | null;
}

export interface GuiSession {
    readonly started: GuiStarted | null;
    readonly runs: GuiRuns | null;
    readonly compactions: GuiCompactions | null;
    readonly chapters: Count | null;
    readonly agents: readonly GuiAgentShare[];
    readonly repo: GuiRepo | null;
    readonly files: readonly GuiFileCount[];
    readonly autocompact: GuiAutocompact | null;
}
