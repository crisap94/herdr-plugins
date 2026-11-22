import type { Instant } from '#src/recap/domain/time.ts';
import type { HandoffId, PaneId, TabId } from '#src/recap/domain/ids.ts';
import type { Origin } from '#src/recap/domain/origin.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { BackgroundItem } from '#src/recap/domain/in-flight.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import type { HandoffSource } from '#src/recap/domain/handoff-source.ts';
import type { HandoffOutcome } from '#src/recap/domain/handoff-outcome.ts';
import type { HandoffPlanResult } from '#src/recap/domain/handoff-plan.ts';
import type { ClosedLaneIdentity } from '#src/recap/domain/closures.ts';
import type { LaneStatus } from '#src/recap/domain/status.ts';
import type { Placed, Split } from '#src/recap/domain/layout.ts';
import type { Unknown } from '@stateforge-labs/session-ledger/unstable/ports/unknowable.ts';
import type { RunItem } from '../../run-inputs.ts';

export type AgentState = { readonly kind: 'agent'; readonly agent: string; readonly status: LaneStatus } | Unknown;

export interface PromptWait {
    readonly until: readonly string[];
    readonly timeoutMs: number;
}

export interface PromptBehavior {
    readonly acceptsStall: boolean;
}

export interface TabLayout {
    readonly kind: 'layout';
    readonly width: number;
    readonly height: number;
    readonly focused: string | null;
    readonly panes: readonly Placed[];
    readonly splits: readonly Split[];
}

export type LayoutResult = TabLayout | Unknown;

export type ClosedAll = { readonly kind: 'closed'; readonly closed: number; readonly failed: number } | Unknown;

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

export type Settled = { readonly kind: 'settled'; readonly status: string } | { readonly kind: 'timeout' };

export interface LaneSettling {
    settled(pane: string, since: Instant, timeoutMs: number): Promise<Settled>;
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
