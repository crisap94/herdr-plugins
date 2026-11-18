import type { CompactionLine } from '#src/recap/domain/compaction-plan.ts';
import type { AgentKind, CompactionId, DecisionId, PaneId, TabId } from '#src/recap/domain/ids.ts';
import type { Duration, Instant, Milliseconds } from '#src/recap/domain/time.ts';
import type { ExchangeName, RequestId } from '#src/protocol/primitives.ts';
import type { AskOutcome } from '#src/recap/domain/ask-outcome.ts';
import type { CoverageOutcome, LaneStatusAtDecision, SkipGate } from '#src/recap/domain/autocompact.ts';
import type { Usd } from '#src/recap/domain/usd.ts';
import type { Shape } from '#src/recap/domain/board.ts';
import type { Origin } from '#src/recap/domain/origin.ts';
import type { AgentState, ClosedAll, LayoutResult, NewHandoffRequest, PromptBehavior, PromptWait } from './twins/runs/legacy.ts';
import type { Unknown } from '@stateforge-labs/session-ledger/unstable/ports/unknowable.ts';
import type { Done, OpenResult, ResizeDirection } from './columns.ts';
import type { LineBehavior, Prompted } from './agents.ts';
import type { AskIdentity, AskKey, Requester } from './ask-ledger.ts';
import type { DecisionCounts, DecisionGate, DecisionMode, DecisionVerdict, LinkedDecision, PaneKey, PassedCoverage, UncheckedCoverage } from './autocompact-records.ts';
import type { ActiveStage, BriefOrigin, EndStage, Stage } from './compaction-records.ts';
import type { Count } from '#src/recap/domain/count.ts';
import type { Probability } from '#src/recap/domain/probability.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Effort } from '#src/recap/domain/effort.ts';
import type { Noul } from './decider.ts';
import type { AnswerMode, CostBasis, ConfinementCell, StructuredSupport, ToolSupport } from './harness.ts';
import type { JudgeTask } from './judge.ts';

export interface Agents {
    status(pane: string): Promise<AgentState>;
    prompt(pane: string, text: string, wait: PromptWait | undefined, behavior: PromptBehavior): Promise<Prompted>;
    typeLine(pane: PaneId, line: CompactionLine, behavior: LineBehavior): Promise<Prompted>;
    askNote(tab: string, pane: string | null): Promise<Done>;
}

export interface Ask {
    readonly exchange: ExchangeName;
    readonly requester: Requester;
    readonly id: RequestId;
    readonly pane: PaneId;
    readonly at: number;
    readonly ref: string | null;
    readonly outcome: AskOutcome | null;
}

export interface NewAsk {
    readonly exchange: ExchangeName;
    readonly requester: Requester;
    readonly id: RequestId;
    readonly pane: PaneId;
    readonly at: number;
    readonly ref: string | null;
}

export interface AskLedger {
    seen(exchange: ExchangeName, requester: Requester, id: RequestId): boolean;
    record(ask: NewAsk): void;
    attach(match: AskKey, ref: string): void;
    withdraw(identity: AskIdentity): void;
    settle(match: AskKey, outcome: AskOutcome): void;
    unfinished(): readonly Ask[];
    prune(before: number): void;
}

export interface HandoffQueue {
    queueHandoff(ask: NewAsk, request: NewHandoffRequest): void;
}

export interface MissedCoverage {
    readonly kind: 'missed';
    readonly count: number;
}

export type StoredCoverageOutcome = PassedCoverage | MissedCoverage | UncheckedCoverage;

export interface Skip {
    readonly tab: TabId;
    readonly pane: PaneId;
    readonly agent: AgentKind;
    readonly at: Instant;
    readonly gate: SkipGate;
    readonly share: number | null;
    readonly detail: string | null;
}

export interface LastDecision {
    readonly at: Instant;
    readonly tokens: number;
    readonly mode: DecisionMode;
    readonly verdict: DecisionVerdict;
    readonly gate: DecisionGate;
}

export interface Decision {
    readonly tab: TabId;
    readonly pane: PaneId;
    readonly agent: AgentKind;
    readonly at: Instant;
    readonly mode: DecisionMode;
    readonly share: number;
    readonly tokens: number;
    readonly window: number;
    readonly gate: DecisionGate;
    readonly verdict: DecisionVerdict;
    readonly askedVerdict: DecisionVerdict | null;
    readonly answers: Readonly<Record<string, number>>;
    readonly coverage: Readonly<Record<string, number>> | null;
    readonly decider: string | null;
    readonly costUsd: Usd;
    readonly tookMs: Duration | null;
    readonly why: string | null;
    readonly laneStatus: LaneStatusAtDecision | null;
    readonly coverageOutcome: CoverageOutcome | null;
    readonly coverageMs: Duration | null;
    readonly coverageCostUsd: Usd | null;
}

export interface StoredDecision extends Omit<Decision, 'coverageOutcome' | 'coverageMs' | 'coverageCostUsd'> {
    readonly id: DecisionId;
    readonly compactionId: CompactionId | null;
    readonly coverageOutcome: StoredCoverageOutcome | null;
    readonly coverageMs: Duration | null;
    readonly coverageCostUsd: Usd | null;
}

export interface CoverageAmendment {
    readonly coverage: Readonly<Record<string, number>> | null;
    readonly outcome: CoverageOutcome;
    readonly coverageMs: Duration;
    readonly coverageCostUsd: Usd | null;
    readonly why: string | null;
    readonly block: boolean;
}

export interface AutocompactRecords {
    record(decision: Decision): DecisionId;
    link(id: DecisionId, compactionId: CompactionId): void;
    linkLatest(tab: TabId, pane: PaneId, compactionId: CompactionId): LinkedDecision | null;
    amend(id: DecisionId, update: CoverageAmendment): void;
    lastDecisionAt(tab: TabId, pane: PaneId): Instant | null;
    lastDecision(tab: TabId, pane: PaneId): LastDecision | null;
    markRequested(id: DecisionId): void;
    unlinkedCompactSince(tab: TabId, pane: PaneId, at: Instant): boolean;
    unlinkedCompactAny(at: Instant): boolean;
    pruneSkips(keep: readonly PaneKey[]): void;
    skip(skip: Skip): void;
    skips(): readonly Skip[];
    newest(limit: Count, tab?: TabId): readonly StoredDecision[];
    countsFor(tab: TabId): DecisionCounts;
    costSince(at: Instant): Usd;
}

export interface Columns {
    layout(tab: TabId): Promise<LayoutResult>;
    open(tab: TabId, target: string, shape: Shape): Promise<OpenResult>;
    resize(pane: PaneId, direction: ResizeDirection, amount: number): Promise<Done>;
    close(pane: PaneId): Promise<Done>;
    closeEvery(): Promise<ClosedAll>;
}

export interface CompactionRecord {
    readonly id: string;
    readonly tab: string;
    readonly pane: string;
    readonly agent: string;
    readonly stage: Stage;
    readonly brief: BriefOrigin | null;
    readonly writer: string | null;
    readonly templateWhy: string | null;
    readonly startedAt: number;
    readonly stageAt: number;
    readonly finishedAt: number | null;
    readonly tokensBefore: number | null;
    readonly tokensAfter: number | null;
    readonly tookMs: number | null;
    readonly retried: boolean;
    readonly queued: boolean;
    readonly why: string | null;
    readonly origin: Origin;
}

export interface BeginCompaction {
    readonly tab: string;
    readonly pane: string;
    readonly agent: string;
    readonly stage: Stage;
    readonly at: number;
    readonly writer?: string | null;
    readonly why?: string | null;
    readonly origin?: Origin;
    readonly answer?: string | null;
}

export interface StageFacts {
    readonly at: number;
    readonly brief?: BriefOrigin | null;
    readonly writer?: string | null;
    readonly templateWhy?: string | null;
    readonly queued?: boolean;
}

export interface CompactionEnd {
    readonly stage: EndStage;
    readonly at: number;
    readonly tokensBefore?: number | null;
    readonly tokensAfter?: number | null;
    readonly tookMs?: number | null;
    readonly retried?: boolean;
    readonly why?: string | null;
}

export interface CompactionView {
    shownFor(tab: string): readonly CompactionRecord[];
    autoInProgress(): boolean;
}

export interface CompactionRecords extends CompactionView {
    begin(start: BeginCompaction): string;
    advance(id: string, stage: ActiveStage, facts: StageFacts): void;
    finish(id: string, end: CompactionEnd): void;
    dismissTurn(tab: string, pane: string, at: number): void;
    interrupted(at: number, why: string): number;
}

export interface Decided {
    readonly kind: 'decided';
    readonly answers: ReadonlyMap<Text, Probability>;
    readonly tokens: number;
    readonly costUsd: Usd;
    readonly tookMs: Duration;
    readonly model: Text;
}

export type DecidedResult = Decided | Unknown;

export interface Decider {
    readonly label: Text;
    ask(state: Text, questions: ReadonlyMap<Text, Noul>): Promise<DecidedResult>;
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

export interface LaneTokens {
    report(pane: string, tokens: Readonly<Record<string, string | null>>, ttlMs: number): Promise<Done>;
}
