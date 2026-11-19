import type { StoredHandoffOutcome, HandoffOutcome } from '#src/recap/domain/handoff-outcome.ts';
import type { HandoffId, PaneId, TabId } from '#src/recap/domain/ids.ts';
import type { HandoffPlanResult } from '#src/recap/domain/handoff-plan.ts';
import type { ClosedLaneIdentity } from '#src/recap/domain/closures.ts';
import type { Effort } from '#src/recap/domain/effort.ts';
import type { Instant, Milliseconds } from '#src/recap/domain/time.ts';
import type { BackgroundItem } from '#src/recap/domain/in-flight.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import type { HandoffSource } from '#src/recap/domain/handoff-source.ts';
import type { Origin } from '#src/recap/domain/origin.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Unknown } from '@stateforge-labs/session-ledger/unstable/ports/unknowable.ts';
import type { AnswerMode, CostBasis, ConfinementCell, StructuredSupport, ToolSupport } from './harness.ts';
import type { JudgeTask } from './judge.ts';
import type { RunItem } from './run-inputs.ts';
import type { Done } from './columns.ts';
import type { NewAsk } from './ask-ledger.ts';

export interface HandoffAnswerRow {
    readonly kind: StoredHandoffOutcome['kind'];
    readonly reason: string | null;
    readonly id: HandoffId;
    readonly at: number;
}

export interface HandoffAnswers {
    answerHandoff(id: HandoffId, outcome: StoredHandoffOutcome): void;
    handoffAnswer(id: HandoffId): HandoffAnswerRow | null;
    prune(before: number): void;
}

export interface HandoffPlans {
    forKind(rawKind: string): HandoffPlanResult;
}

export interface PrintRequest {
    readonly from: PaneId;
    readonly to: PaneId | null;
    readonly note: string | null;
    readonly closed: ClosedLaneIdentity | null;
}

export type PrintResult =
    | { readonly kind: 'text'; readonly text: string; readonly info: string | null }
    | Extract<HandoffOutcome, { readonly kind: 'refused' | 'failed' }>;

export interface HandoffPrinter {
    renderForPrint(request: PrintRequest): Promise<PrintResult>;
}

export interface HarnessCall {
    readonly instructions: string;
    readonly input: string;
    readonly answer?: AnswerMode;
}

export interface HarnessSettings {
    readonly model: string;
    readonly effort: Effort;
    readonly timeoutMs?: Milliseconds;
}

export type Ran = { readonly kind: 'ran'; readonly text: string; readonly costUsd: number; readonly costBasis?: CostBasis; readonly confinement?: readonly ConfinementCell[] } | Unknown;

export interface Harness<Id extends string = string> {
    readonly id: Id;
    label(settings: HarnessSettings): string;
    readonly limit: number | null;
    readonly structured?: StructuredSupport;
    readonly tools?: ToolSupport;
    run(call: HarnessCall, settings: HarnessSettings): Promise<Ran>;
}

export type HarnessesResult = { readonly kind: 'available'; readonly ids: readonly string[] } | Unknown;

export interface Harnesses {
    available(): Promise<HarnessesResult>;
}

export interface ImportedChapter {
    readonly n: number;
    readonly at: number;
    readonly items: readonly RunItem[];
}

export type InFlightReading =
    | { readonly kind: 'not-started'; readonly why: string }
    | { readonly kind: 'count'; readonly count: number; readonly background: readonly BackgroundItem[] }
    | { readonly kind: 'unknown'; readonly why: string };

export interface InFlight {
    read(lane: Lane): Promise<InFlightReading>;
}

export type Said = { readonly kind: 'said'; readonly text: string; readonly costUsd: number } | Unknown;

export interface Judge {
    readonly label: string;
    ask(task: JudgeTask, document: string): Promise<Said>;
}

export interface CheckAnchor {
    readonly item: string;
    readonly pass: boolean;
    readonly reason: string;
}

export type CheckAnchors = ReadonlyMap<string, readonly CheckAnchor[]>;

export type Settled = { readonly kind: 'settled'; readonly status: string } | { readonly kind: 'timeout' };

export interface LaneSettling {
    settled(pane: string, since: Instant, timeoutMs: number): Promise<Settled>;
}

export interface LaneTokens {
    report(pane: string, tokens: Readonly<Record<string, string | null>>, ttlMs: number): Promise<Done>;
}

export interface ModelCatalogue {
    windowOf(model: string): number | null;
}

export type Notified = { readonly kind: 'shown' } | Unknown;

export interface Notifier {
    notify(title: string, body: string): Promise<Notified>;
}

export interface RunResult {
    readonly code: number;
    readonly stdout: string;
    readonly stderr: string;
    readonly timedOut: boolean;
}

export interface RunOptions {
    readonly input: string;
    readonly timeoutMs: number;
    readonly cwd: string;
    readonly env: NodeJS.ProcessEnv;
    readonly killAfterMs?: number;
}

export type Runner = (command: string, args: readonly string[], options: RunOptions) => Promise<RunResult>;

export interface ProcessControl {
    readonly run: Runner;
    readonly killTree: (pid: number, force: boolean) => void;
}

export interface VisibilityRequest {
    readonly target: string;
    readonly hidden: boolean | 'toggle';
}

export interface CompactRequest {
    readonly tab: string;
    readonly pane: string | null;
    readonly note: string | null;
    readonly origin?: Origin;
    readonly answer?: string;
}

export interface HandoffRequestRow {
    readonly id: HandoffId;
    readonly at: number;
    readonly tab: TabId;
    readonly pane: PaneId;
    readonly toPane: PaneId;
    readonly refreshFirst: boolean;
    readonly note: string | null;
    readonly source: HandoffSource;
    readonly answer?: Text | null;
}

export interface NewHandoffRequest {
    readonly tab: TabId;
    readonly pane: PaneId;
    readonly toPane: PaneId;
    readonly note: string | null;
    readonly refreshFirst: boolean;
    readonly source: HandoffSource;
    readonly answer?: Text;
}

export interface HandoffRequester {
    requestHandoff(request: NewHandoffRequest): HandoffId;
    withdrawHandoff(id: HandoffId): boolean;
}

export interface HandoffQueue {
    queueHandoff(ask: NewAsk, request: NewHandoffRequest): void;
}

export interface HandoffResponder {
    takeHandoffs(): readonly HandoffRequestRow[];
}

export interface AnswerRow {
    readonly pane: string;
    readonly answer: string;
}

export interface Requests extends HandoffRequester, HandoffResponder {
    request(tab: string): void;
    requestVisibility(request: VisibilityRequest): void;
    requestCompact(request: CompactRequest): void;
    requestCurate(tab: string): void;
    takeRequests(): readonly TabId[];
    takeVisibility(): readonly VisibilityRequest[];
    takeCompactions(): readonly CompactRequest[];
    takeCurations(): readonly TabId[];
    takeAnswered(): readonly AnswerRow[];
}

export interface CompactionQueue {
    compactQueued(tab: TabId, pane: PaneId): boolean;
}

export interface Removed {
    readonly runs: number;
    readonly chapters: number;
    readonly boundaries: number;
    readonly compactions: number;
    readonly facts: number;
}

export interface Retention {
    expired(cutoff: number, protectedTabs: readonly TabId[]): readonly TabId[];
    remove(tab: TabId): Removed;
}
