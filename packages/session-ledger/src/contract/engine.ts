import type { Directory, HarnessKind, RestoreText, ScopeId, SessionId, SessionKey } from './ids.ts';
import type { FollowedSession, RecapCause, SessionSource } from './session.ts';
import type { Applied, CloseOp, Fact, HistoryFact, TaskId, UpdateOp } from './facts.ts';
import type { FactStore, Records } from './records.ts';
import type { Curator, Enumerator, Writer } from './models.ts';
import type { Clock, Ids, Workplaces } from './environment.ts';
import type { Instant, Text } from './kernel.ts';
import type { Debounce, Pacing, Pipeline, Shown, WriterView } from './settings.ts';
import type { LedgerEvent } from './events.ts';

export type FlushWhy = 'requested' | 'shutdown' | 'closed' | 'handoff' | 'handoff print' | 'autocompact';

export interface RestoreFacts {
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

export interface EnginePlugs {
    readonly source: { readonly sessions: SessionSource };
    readonly store: { readonly records: Records; readonly facts: FactStore; readonly stories?: Stories };
    readonly models: { writer(): Writer; enumerator?(): Enumerator | null; curator?(): Curator | null };
    readonly environment: { readonly clock: Clock; readonly ids: Ids; readonly workplaces: Workplaces; log(line: string): void };
    readonly settings: {
        language(): string;
        writerView(): WriterView;
        keepInput?(): boolean;
        pipeline?(): Pipeline;
        debounce?(): Debounce;
        pacing?(): Pacing;
        visible?(scope: ScopeId): Shown;
        restoreBytes?(): number;
        rubric?(): Text;
        restoreText?(facts: RestoreFacts): RestoreText;
    };
    on?(event: LedgerEvent): void;
}
export interface Engine {
    follow(scope: ScopeId, session: FollowedSession): void;
    unfollow(scope: ScopeId, key: SessionKey): void;
    followedBy(harness: HarnessKind, session: SessionId): { readonly scope: ScopeId; readonly key: SessionKey } | null;
    turnEnded(scope: ScopeId, key: SessionKey | null, cause: RecapCause): void;
    sessionStarted(scope: ScopeId, key: SessionKey, now: { readonly session: SessionId | null; readonly cwd: Directory | null }): void;
    refresh(scope: ScopeId): Promise<void>;
    flush(scope: ScopeId, why?: FlushWhy): Promise<void>;
    flushAll(): Promise<void>;
    compacted(scope: ScopeId, key: SessionKey): RestoreText;
    history(scope: ScopeId, key: SessionKey): readonly HistoryFact[];
    curate(scope: ScopeId): Promise<void>;
}
export type CreateEngine = (plugs: EnginePlugs) => Engine;
