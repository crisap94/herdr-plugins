import type {
    Awaiting as RootAwaiting,
    BackgroundItem as RootBackgroundItem,
    ContextUse as RootContextUse,
    Flight,
    Observed,
    Unknown,
    WindowSource as RootWindowSource,
} from '@stateforge-labs/session-ledger';
import type {
    Awaiting,
    Backoff,
    BackgroundItem,
    Candidate,
    CeilingPolicy,
    CheckedFact,
    CompactionActivity,
    CompactionAsk,
    Consideration,
    ContextUse,
    ContinuationNote,
    CoverageAmendment,
    CoverageOutcome,
    Decided,
    Decider,
    DeciderState,
    Decision,
    DecisionGate,
    DecisionLog,
    DecisionMode,
    DecisionStyle,
    Effect,
    GateInput,
    LaneStatusAtDecision,
    LastDecision,
    LinkedDecision,
    Milliseconds,
    MissedFacts,
    NoteLimit,
    OpenWorkItem,
    Policy,
    PolicySettings,
    Question,
    RecapReadiness,
    RegisteredKind,
    SafePointEvent,
    SafePointPorts,
    SafePointWatch,
    SessionSignals,
    Skip,
    SkipGate,
    Sweep,
    Thresholds,
    Tuning,
    Turn,
    UncheckedReason,
    Verdict,
    WatchMode,
    WindowSource,
} from '@stateforge-labs/session-ledger/compaction-timing';

type Holds<T extends true> = T;
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

export type ClosureNames = [ContextUse, WindowSource, Awaiting, BackgroundItem];
export type WrittenNames = [Candidate, PolicySettings, CompactionAsk, Consideration, SafePointEvent, SafePointWatch, SafePointPorts, Decider, SessionSignals, CompactionActivity, RecapReadiness, DecisionLog, Sweep];
export type CopiedNames = [WatchMode, SkipGate, DecisionGate, Verdict, Effect, Policy, Tuning, Skip, Decision, Decided, Question, CeilingPolicy, Backoff, MissedFacts, Thresholds, DecisionStyle, CoverageOutcome, LastDecision, LinkedDecision, CoverageAmendment, GateInput, DeciderState, ContinuationNote, NoteLimit];
export type CopiedClosureNames = [Milliseconds, UncheckedReason, CheckedFact, DecisionMode, LaneStatusAtDecision, RegisteredKind, Turn, OpenWorkItem];

export type ContextUseIsDeclaredOnce = Holds<Same<ContextUse, RootContextUse>>;
export type WindowSourceIsDeclaredOnce = Holds<Same<WindowSource, RootWindowSource>>;
export type AwaitingIsDeclaredOnce = Holds<Same<Awaiting, RootAwaiting>>;
export type BackgroundItemIsDeclaredOnce = Holds<Same<BackgroundItem, RootBackgroundItem>>;
export type VerdictsAreFour = Holds<Same<Verdict, 'compact' | 'wait' | 'undecided' | 'unknown'>>;
export type AKnownVerdictIsThree = Holds<Same<Exclude<Verdict, 'unknown'>, 'compact' | 'wait' | 'undecided'>>;
export type WatchModesAreThree = Holds<Same<WatchMode, 'off' | 'shadow' | 'on'>>;
export type ARecordedModeIsNotOff = Holds<Same<DecisionMode, Exclude<WatchMode, 'off'>>>;
export type SkipGatesAreSeven = Holds<Same<SkipGate, 'below-minimum' | 'busy' | 'in-flight' | 'cooldown' | 'unchanged' | 'no-context' | 'coverage-backoff'>>;
export type RegisteredKindsAreThree = Holds<Same<RegisteredKind, 'claude' | 'codex' | 'opencode'>>;
export type PolicyKeepsMainKinds = Holds<Same<Policy['kinds'], readonly string[]>>;
export type PolicyShadowKindsAreRegistered = Holds<Same<Policy['shadowKinds'], readonly RegisteredKind[]>>;
export type SkipKeepsMainFieldNames = Holds<Same<Pick<Skip, 'tab' | 'pane' | 'agent'>, { readonly tab: string; readonly pane: string; readonly agent: string }>>;
export type DecisionKeepsLaneStatus = Holds<Same<Decision['laneStatus'], LaneStatusAtDecision | null>>;
export type GateInputHoldsAFlight = Holds<Same<GateInput['flight'], Flight | null>>;
export type InFlightIsObserved = Holds<Same<Awaited<ReturnType<SessionSignals['inFlight']>>, Observed>>;
export type ContextUseMayBeMissing = Holds<Same<ReturnType<SessionSignals['contextUse']>, ContextUse | null>>;
export type DeciderMayBeUnknown = Holds<Unknown extends Awaited<ReturnType<Decider['ask']>> ? true : false>;
export type DeciderAsksWithState = Holds<Same<Parameters<Decider['ask']>[0], DeciderState>>;
export type AskCarriesANote = Holds<Same<CompactionAsk['note'], ContinuationNote | null>>;
export type ConsiderationKindsAreThree = Holds<Same<Consideration['kind'], 'not-considered' | 'skipped' | 'decided'>>;
export type WatchRecordsInTheLog = Holds<Same<SafePointPorts['records'], DecisionLog>>;
export type RecordReturnsAnId = Holds<Same<ReturnType<DecisionLog['record']>, string>>;
export type StylesAreThree = Holds<Same<DecisionStyle, 'gentle' | 'balanced' | 'eager'>>;
export type MissedFactsAreTwo = Holds<Same<MissedFacts, 'append' | 'wait'>>;
export type EffectsAreTwo = Holds<Same<Effect, 'record-only' | 'may-act'>>;
