import type { Directory, HarnessKind, RestoreText, ScopeId, SessionId, SessionKey } from './ids.ts';
import type { FollowedSession, RecapCause, SessionSource } from './session.ts';
import type { HistoryFact } from './facts.ts';
import type { FactStore, Records } from './records.ts';
import type { Curator, Enumerator, Writer } from './models.ts';
import type { Clock, Ids, Workplaces } from './environment.ts';
import type { Debounce, Pipeline, WriterView } from './settings.ts';
import type { LedgerEvent } from './events.ts';

export interface EnginePlugs {
    readonly source: { readonly sessions: SessionSource };
    readonly store: { readonly records: Records; readonly facts: FactStore };
    readonly models: { writer(): Writer; enumerator?(): Enumerator | null; curator?(): Curator | null };
    readonly environment: { readonly clock: Clock; readonly ids: Ids; readonly workplaces: Workplaces; log(line: string): void };
    readonly settings: {
        language(): string;
        writerView(): WriterView;
        keepInput?(): boolean;
        pipeline?(): Pipeline;
        debounce?(): Debounce;
        restoreBytes?(): number;
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
    compacted(scope: ScopeId, key: SessionKey): RestoreText;
    history(scope: ScopeId, key: SessionKey): readonly HistoryFact[];
    curate(scope: ScopeId): Promise<void>;
}
export type CreateEngine = (plugs: EnginePlugs) => Engine;
