import type { Directory, HarnessKind, RestoreText, ScopeId, SessionId, SessionKey } from './ids.ts';
import type { FollowedSession, RecapCause, SessionSource } from './session.ts';
import type { Applied, CloseOp, Fact, HistoryFact, TaskId, UpdateOp } from './facts.ts';
import type { LastRun } from './records.ts';
import type { FactStore, Records } from './records.ts';
import type { Curator, Enumerator, Writer } from './models.ts';
import type { Clock, Ids, Workplaces } from './environment.ts';
import type { Brand, Instant, Text } from './kernel.ts';
import type { Debounce, Pacing, Pipeline, PositiveCount, Shown, StoryRepair, WriterView } from './settings.ts';
import type { LedgerEvent } from './events.ts';

export type Attention = 'needs-you' | 'none';
export type FlushWhy = 'requested' | 'shutdown' | 'closed' | 'handoff' | 'handoff print' | 'autocompact';

export interface RestoreFacts {
    readonly at: Instant;
    readonly lastRun: LastRun | null;
    readonly open: readonly Fact[];
    readonly closed: readonly Fact[];
}

export interface CurationRun {
    readonly task: TaskId;
    readonly at: Instant;
    readonly language: Text;
}

export interface StoryChange {
    readonly story: Text | null;
    readonly merges: readonly CloseOp[];
    readonly reconciled?: readonly (UpdateOp | CloseOp)[];
}

export interface KeptStory {
    readonly text: Text;
    readonly at: Instant;
}

export interface Stories {
    read(task: TaskId): KeptStory | null;
    keep(run: CurationRun, change: StoryChange): Applied;
}

export type KeepInput = 'keep' | 'drop';
export type ByteCount = Brand<number, 'ByteCount'>;

export interface SourcePlugs {
    readonly sessions: SessionSource;
}

export interface StorePlugs {
    readonly records: Records;
    readonly facts: FactStore;
    readonly stories?: Stories;
}

export interface ModelPlugs {
    writer(): Writer;
    enumerator?(): Enumerator | null;
    curator?(): Curator | null;
}

export interface EnvironmentPlugs {
    readonly clock: Clock;
    readonly ids: Ids;
    readonly workplaces: Workplaces;
    log(line: Text): void;
}

export interface SettingsPlugs {
    language(): Text;
    writerView(): WriterView;
    keepInput?(): KeepInput;
    pipeline?(): Pipeline;
    debounce?(): Debounce;
    pacing?(): Pacing;
    visible?(scope: ScopeId): Shown;
    restoreBytes?(): ByteCount;
    rubric?(): Text;
    storyRepair?(): StoryRepair;
    reconcileEvery?(): PositiveCount;
    restoreText?(facts: RestoreFacts): RestoreText;
}

export interface EnginePlugs {
    readonly source: SourcePlugs;
    readonly store: StorePlugs;
    readonly models: ModelPlugs;
    readonly environment: EnvironmentPlugs;
    readonly settings: SettingsPlugs;
    on?(event: LedgerEvent): void;
}

export interface Following {
    readonly scope: ScopeId;
    readonly key: SessionKey;
}

export interface SessionNow {
    readonly session: SessionId | null;
    readonly cwd: Directory | null;
}

export interface Engine {
    follow(scope: ScopeId, session: FollowedSession): void;
    unfollow(scope: ScopeId, key: SessionKey): void;
    followedBy(harness: HarnessKind, session: SessionId): Following | null;
    turnEnded(scope: ScopeId, key: SessionKey | null, cause: RecapCause, attention?: Attention): void;
    sessionStarted(scope: ScopeId, key: SessionKey, now: SessionNow): void;
    refresh(scope: ScopeId): Promise<void>;
    flush(scope: ScopeId, why?: FlushWhy): Promise<void>;
    flushAll(): Promise<void>;
    compacted(scope: ScopeId, key: SessionKey): RestoreText;
    history(scope: ScopeId, key: SessionKey): readonly HistoryFact[];
    curate(scope: ScopeId): Promise<void>;
}
export type CreateEngine = (plugs: EnginePlugs) => Engine;
