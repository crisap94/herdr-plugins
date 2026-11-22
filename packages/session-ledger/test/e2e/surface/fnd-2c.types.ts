import type {
    AgentNote,
    AwaitedNames,
    Awaiting,
    BackgroundItem,
    BackgroundLabel,
    BackgroundTool,
    CallKind,
    Chunk,
    CloseEvidence,
    ContextUse,
    Correction,
    Curated,
    Curator,
    CuratorMode,
    Debounce,
    Duration,
    Entry,
    Enumerated,
    Enumerator,
    Flight,
    FlightReason,
    Forge,
    Foreground,
    HiddenCounts,
    InputAgent,
    InputCandidate,
    InputFact,
    InputLedger,
    InputNote,
    InputTranscript,
    JobContract,
    KeepNewest,
    LaneHint,
    Located,
    Mark,
    NextHours,
    Observed,
    Pipeline,
    PositiveCount,
    PrunedWriterView,
    RecapInput,
    RecapRequest,
    RefusedOperation,
    RepoResult,
    RunningCount,
    StoryRepair,
    TaskGroup,
    Unknown,
    WebBase,
    WindowSource,
    Workplaces,
    Writer,
    WriterView,
    Written,
} from '@stateforge-labs/session-ledger';

type Holds<T extends true> = T;
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

export type SessionNames = [CallKind, Entry, AgentNote, Mark, Chunk, Located, RunningCount, FlightReason, AwaitedNames, BackgroundTool, BackgroundLabel, BackgroundItem, Foreground, Awaiting, Observed, Flight, WindowSource, ContextUse];
export type ModelNames = [InputAgent, LaneHint, TaskGroup, InputNote, InputTranscript, InputFact, InputLedger, InputCandidate, RecapInput, RefusedOperation, Correction, RecapRequest, Written, JobContract, Writer, Enumerated, Enumerator, Curated, Curator, CuratorMode];
export type SettingNames = [PositiveCount, KeepNewest, NextHours, HiddenCounts, PrunedWriterView, WriterView, Pipeline, Debounce, CloseEvidence, StoryRepair];
export type EnvironmentNames = [Forge, WebBase, RepoResult];

export type LocatedMayBeUnknown = Holds<Unknown extends Located ? true : false>;
export type ChunkKeepsPosition = Holds<Chunk['position'] extends { readonly cursor: number; readonly tail: string | null } ? true : false>;
export type FlightExtendsObserved = Holds<Flight extends Observed ? true : false>;
export type FlightAwaits = Holds<Same<Flight['awaiting'], Awaiting>>;
export type ContextUseNamesItsSource = Holds<Same<ContextUse['source'], WindowSource>>;
export type WindowSourcesAreFive = Holds<Same<WindowSource, 'agent' | 'catalogue' | 'table' | 'observed' | 'setting'>>;
export type WriterTakesARequest = Holds<Same<Parameters<Writer['write']>[0], RecapRequest>>;
export type WriterMayBeUnknown = Holds<Unknown extends Awaited<ReturnType<Writer['write']>> ? true : false>;
export type WriterNamesItsContract = Holds<Same<Writer['contract'], JobContract>>;
export type JobContractsAreTwo = Holds<Same<JobContract, 'strict' | 'free-text'>>;
export type RequestCarriesInput = Holds<Same<RecapRequest['input'], RecapInput>>;
export type EnumeratorMayBeUnknown = Holds<Unknown extends Awaited<ReturnType<Enumerator['write']>> ? true : false>;
export type CuratorModeIsOptional = Holds<undefined extends Parameters<Curator['write']>[1] ? true : false>;
export type CuratorModesAreTwo = Holds<Same<CuratorMode, 'story' | 'reconcile'>>;
export type CuratedMayBeUnknown = Holds<Unknown extends Curated ? true : false>;
export type EnumeratedMayBeUnknown = Holds<Unknown extends Enumerated ? true : false>;
export type WrittenMayBeUnknown = Holds<Unknown extends Written ? true : false>;
export type PipelinesAreFour = Holds<Same<Pipeline, 'one' | 'enumerate' | 'enumerate+gates' | 'full'>>;
export type DebounceWindowIsADuration = Holds<Same<Extract<Debounce, { readonly kind: 'window' }>['window'], Duration>>;
export type WriterViewIsFullOrPruned = Holds<Same<WriterView['kind'], 'full' | 'pruned'>>;
export type RepoOfReturnsARepoResult = Holds<Same<Awaited<ReturnType<Workplaces['repoOf']>>, RepoResult>>;
export type RepoResultMayBeUnknown = Holds<Unknown extends RepoResult ? true : false>;
export type ForgesAreTwo = Holds<Same<Forge, 'gitlab' | 'github'>>;
