import type {
    Advance,
    AddOp,
    Applied,
    ClosedWhy,
    CloseOp,
    Fact,
    FactId,
    FactStore,
    FailedRun,
    GateStats,
    HistoryFact,
    LastRun,
    Operation,
    OwnTrigger,
    Reason,
    Recap,
    RecapSections,
    RecapTask,
    RecordedRun,
    Records,
    Refusal,
    RunFacts,
    RunId,
    RunRef,
    Section,
    SectionId,
    SessionCursor,
    SessionMark,
    Story,
    TaskId,
    TaskOps,
    TaskShape,
    Unknown,
    UpdateOp,
} from '@stateforge-labs/session-ledger';

type Holds<T extends true> = T;

export type FactNames = [FactId, RunId, TaskId, Section, SectionId, ClosedWhy, Fact, AddOp, UpdateOp, CloseOp, Operation, TaskOps, Reason, Refusal, RunRef, Applied];
export type RecordNames = [SessionCursor, Recap, RecapTask, RecapSections, RunFacts, RecordedRun, FailedRun, Advance, LastRun, SessionMark, OwnTrigger, TaskShape, GateStats, Story, Records, FactStore];

export type TaskIdKeepsMainFields = Holds<TaskId extends { readonly tab: string; readonly key: string } ? true : false>;
export type SectionIdIsSection = Holds<[SectionId] extends [Section] ? ([Section] extends [SectionId] ? true : false) : false>;
export type SectionsAreEight = Holds<'goal' | 'now' | 'needs' | 'done' | 'decisions' | 'next' | 'links' | 'rules' extends Section ? ([Section] extends ['goal' | 'now' | 'needs' | 'done' | 'decisions' | 'next' | 'links' | 'rules'] ? true : false) : false>;
export type ReadRecapMayBeUnknown = Holds<Unknown extends ReturnType<Records['readRecap']> ? true : false>;
export type OpenOfMayBeUnknown = Holds<Unknown extends ReturnType<FactStore['openOf']> ? true : false>;
export type HistoryOfIsAlwaysRead = Holds<ReturnType<FactStore['historyOf']> extends readonly HistoryFact[] ? true : false>;
export type RecapKeepsLanes = Holds<Recap['lanes'] extends readonly SessionCursor[] ? true : false>;
export type TaskShapeIsPicked = Holds<keyof TaskShape extends 'id' | 'name' | 'lanes' ? true : false>;
