import type {
    AccomplishmentEstablished,
    Brand,
    Clock,
    CreateEngine,
    Directory,
    Duration,
    Engine,
    EnginePlugs,
    FollowedSession,
    HarnessKind,
    HistoryFact,
    Ids,
    Instant,
    LedgerEvent,
    ParseFailure,
    Position,
    RecapCause,
    RecapWritten,
    RestoreText,
    Result,
    ScopeId,
    SessionId,
    SessionKey,
    SessionReader,
    SessionSource,
    Text,
    TurnRecorded,
    Unknowable,
    Unknown,
    Workplaces,
} from '#src/index.ts';

type Holds<T extends true> = T;

export type KernelNames = [Brand<string, 'Probe'>, Result<Instant, ParseFailure>, Duration, Text, Unknowable, Unknown];
export type IdNames = [ScopeId, SessionKey, SessionId, HarnessKind, RestoreText, Directory];
export type SessionNames = [FollowedSession, RecapCause, SessionReader, SessionSource, Position, HistoryFact];
export type EnvironmentNames = [Clock, Ids, Workplaces];
export type EventNames = [TurnRecorded, AccomplishmentEstablished, RecapWritten, LedgerEvent];
export type CallNames = [EnginePlugs, Engine, CreateEngine];

export type TurnEndedTakesNoKey = Holds<null extends Parameters<Engine['turnEnded']>[1] ? true : false>;
export type CompactedIsSynchronous = Holds<ReturnType<Engine['compacted']> extends RestoreText ? true : false>;
export type FollowedByIsSynchronous = Holds<ReturnType<Engine['followedBy']> extends Promise<unknown> ? false : true>;
export type CausesAreThree = Holds<[RecapCause] extends ['turn-ended' | 'focused' | 'requested'] ? ('turn-ended' | 'focused' | 'requested' extends RecapCause ? true : false) : false>;
