import type {
    AccomplishmentEstablished,
    Brand,
    ContextUse,
    Entry,
    Flight,
    HarnessKind,
    HistoryFact,
    Observed,
    ScopeId,
    Section,
    SessionKey,
    Text,
    Unknown,
} from './engine-port.ts';
import type { AutocompactPercent, Count, DecisionId, Duration, Instant, Probability, Usd } from '../contract/kernel.ts';

export type { Awaiting, BackgroundItem, ContextUse, WindowSource } from './engine-port.ts';

export type RegisteredKind = 'claude' | 'codex' | 'opencode';
export type LaneKind = RegisteredKind | HarnessKind;
export type AutocompactKinds = readonly LaneKind[];

export type Milliseconds = Brand<number, 'Milliseconds'>;
export type CeilingPolicy = 'overrides-check' | 'blocked-by-check';
export type Backoff = { readonly kind: 'off' } | { readonly kind: 'window'; readonly ms: Milliseconds };
export type MissedFacts = 'append' | 'wait';
export type UncheckedReason = 'no-decider' | 'decider-cannot-answer' | 'no-brief';
export interface CheckedFact {
    readonly section: Section;
    readonly text: Text;
    readonly why: Text | null;
}

export type CoverageOutcome = { readonly kind: 'passed' } | { readonly kind: 'missed'; readonly facts: readonly CheckedFact[] } | { readonly kind: 'unchecked'; readonly reason: UncheckedReason };

export type WatchMode = 'off' | 'shadow' | 'on';

export interface Policy {
    readonly mode: WatchMode;
    readonly minimum: AutocompactPercent;
    readonly ceiling: AutocompactPercent;
    readonly cooldownMs: Milliseconds;
    readonly kinds: AutocompactKinds;
    readonly shadowKinds: readonly RegisteredKind[];
    readonly ceilingPolicy: CeilingPolicy;
    readonly coverageBackoff: Backoff;
    readonly missedFacts: MissedFacts;
}

export type LaneStatusAtDecision = 'idle' | 'done' | 'working';

export type SkipGate = 'below-minimum' | 'busy' | 'in-flight' | 'cooldown' | 'unchanged' | 'no-context' | 'coverage-backoff';

export interface GateInput {
    readonly kind: LaneKind;
    readonly kinds: AutocompactKinds;
    readonly shadowKinds: readonly RegisteredKind[];
    readonly busy: 'busy' | 'free';
    readonly flight: Flight | null;
    readonly share: AutocompactPercent;
    readonly minimum: AutocompactPercent;
    readonly ceiling: AutocompactPercent;
    readonly now: Instant;
    readonly lastBreakAt: Instant | null;
    readonly lastDecisionAt: Instant | null;
    readonly cooldownMs: Duration;
    readonly unchanged: 'same' | 'changed';
    readonly coverageBackoff?: 'backing-off' | 'open';
}

export type Threshold = Probability;

export interface Thresholds { readonly safe: Threshold; readonly closes: Threshold; readonly undecidedFrom: Threshold; readonly undecidedTo: Threshold }

export type DecisionStyle = 'gentle' | 'balanced' | 'eager';

export interface Tuning {
    readonly style: DecisionStyle;
    readonly verdict: Thresholds;
    readonly coverageAtLeast: Probability;
    readonly recheckIdleMs: Milliseconds | null;
}

export type Effect = 'record-only' | 'may-act';

export type DecisionMode = 'shadow' | 'on';
export type DecisionGate = 'ask' | 'ceiling' | 'coverage';
export type Verdict = 'compact' | 'wait' | 'undecided' | 'unknown';
export interface LinkedDecision {
    readonly id: DecisionId;
    readonly gate: DecisionGate;
}

export interface Skip {
    readonly tab: ScopeId;
    readonly pane: SessionKey;
    readonly agent: HarnessKind;
    readonly at: Instant;
    readonly gate: SkipGate;
    readonly share: Count | null;
    readonly detail: Text | null;
}

export interface LastDecision {
    readonly at: Instant;
    readonly tokens: Count;
    readonly mode: DecisionMode;
    readonly verdict: Verdict;
    readonly gate: DecisionGate;
}

export interface Decision {
    readonly tab: ScopeId;
    readonly pane: SessionKey;
    readonly agent: HarnessKind;
    readonly at: Instant;
    readonly mode: DecisionMode;
    readonly share: Count;
    readonly tokens: Count;
    readonly window: Count;
    readonly gate: DecisionGate;
    readonly verdict: Verdict;
    readonly askedVerdict: Verdict | null;
    readonly answers: ReadonlyMap<Text, Probability>;
    readonly coverage: ReadonlyMap<Text, Probability> | null;
    readonly decider: Text | null;
    readonly costUsd: Usd;
    readonly tookMs: Duration | null;
    readonly why: Text | null;
    readonly laneStatus: LaneStatusAtDecision | null;
    readonly coverageOutcome: CoverageOutcome | null;
    readonly coverageMs: Duration | null;
    readonly coverageCostUsd: Usd | null;
}

export interface CoverageAmendment {
    readonly coverage: ReadonlyMap<Text, Probability> | null;
    readonly outcome: CoverageOutcome;
    readonly coverageMs: Duration;
    readonly coverageCostUsd: Usd | null;
    readonly why: Text | null;
    readonly block: 'blocks' | 'allows';
}

export interface QuestionCriteria {
    readonly true: Text;
    readonly false: Text;
}

export interface Question {
    readonly instructions: Text;
    readonly criteria: QuestionCriteria;
}

export interface Decided {
    readonly kind: 'decided';
    readonly answers: ReadonlyMap<Text, Probability>;
    readonly tokens: Brand<number, 'TokenAmount'>;
    readonly costUsd: Usd;
    readonly tookMs: Duration;
    readonly model: Text;
}

export interface Turn {
    readonly role: Entry['role'];
    readonly text: Text;
}

export interface OpenWorkItem {
    readonly section: Text;
    readonly text: Text;
}

export interface DeciderState {
    readonly last_prompt: Text | null;
    readonly last_reply: Text | null;
    readonly recent_turns: readonly Turn[];
    readonly goal: Text | null;
    readonly open_work: readonly OpenWorkItem[];
}

export type ContinuationNote = Brand<string, 'ContinuationNote'>;
export type NoteLimit = Brand<number, 'NoteLimit'>;

export interface Candidate { readonly scope: ScopeId; readonly key: SessionKey; readonly harness: HarnessKind; readonly ready: boolean }
export interface PolicySettings { readonly mode?: string; readonly style?: string; readonly at?: string; readonly ceiling?: string; readonly cooldownMs?: string; readonly kinds?: string; readonly shadowKinds?: string; readonly ceilingOverridesCheck?: string; readonly coverageBackoffMs?: string; readonly missedFacts?: string }

export interface CompactionAsk { readonly scope: ScopeId; readonly key: SessionKey; readonly decisionId: string; readonly note: ContinuationNote | null }
export type Consideration =
    | { readonly kind: 'not-considered'; readonly why: 'off' | 'not-ready' | 'already-considering' | 'failed' }
    | { readonly kind: 'skipped'; readonly skip: Skip }
    | { readonly kind: 'decided'; readonly decisionId: string; readonly decision: Decision; readonly effect: Effect; readonly ask: CompactionAsk | null };
export type SafePointEvent =
    | { readonly kind: 'session-skipped'; readonly key: SessionKey; readonly gate: SkipGate }
    | { readonly kind: 'safe-point-decided'; readonly key: SessionKey; readonly verdict: Verdict; readonly share: number }
    | { readonly kind: 'decider-unreachable'; readonly why: string }
    | { readonly kind: 'decider-recovered' };

export interface SafePointWatch {
    consider(candidate: Candidate): Promise<Consideration>;
    accomplished(event: AccomplishmentEstablished, candidates: readonly Candidate[]): Promise<readonly Consideration[]>;
    requested(ask: CompactionAsk): void;
    prune(candidates: readonly Candidate[]): void;
}

export interface SafePointPorts {
    policy(): Policy; tuning?(): Tuning; decider(): Decider | null;
    readonly records: DecisionLog; readonly activity: CompactionActivity; readonly sessions: SessionSignals; readonly recaps: RecapReadiness;
    readonly startedAt: number; now(): number; log(line: string): void; emit?(event: SafePointEvent): void;
    statusOf?(key: SessionKey): 'idle' | 'done' | 'working' | null;
}
export interface Decider { readonly label: string; ask(state: DeciderState, questions: Readonly<Record<string, Question>>): Promise<Decided | Unknown> }
export interface SessionSignals {
    contextUse(key: SessionKey): ContextUse | null;
    inFlight(candidate: Candidate): Promise<Observed>;
    awaiting?(key: SessionKey): Promise<{ readonly kind: 'clear' } | { readonly kind: 'waiting'; readonly value: string } | Unknown>;
    recentTurns(candidate: Candidate): Promise<readonly Entry[]>;
    history(scope: ScopeId, key: SessionKey): readonly HistoryFact[];
    lastBreakAt(scope: ScopeId, key: SessionKey): number | null;
}
export interface CompactionActivity { activeFor(scope: ScopeId, key: SessionKey): boolean; automaticInProgress(): boolean }
export interface RecapReadiness { ensure(scope: ScopeId): Promise<void> }
export interface DecisionLog {
    record(decision: Decision): string; skip(skip: Skip): void; markRequested(id: string): void;
    pruneSkips(keep: readonly { readonly scope: ScopeId; readonly key: SessionKey }[]): void;
    lastDecisionAt(scope: ScopeId, key: SessionKey): number | null; lastDecision(scope: ScopeId, key: SessionKey): LastDecision | null;
    unlinkedCompactSince(scope: ScopeId, key: SessionKey, at: number): boolean; unlinkedCompactAny(at: number): boolean;
    link(id: string, compactionId: string): void; linkLatest(scope: ScopeId, key: SessionKey, compactionId: string): LinkedDecision | null; amend(id: string, update: CoverageAmendment): void;
}
export interface Sweep { tick(): void; sweep(): Promise<void> }
