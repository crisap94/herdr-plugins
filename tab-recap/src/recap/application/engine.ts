import type { TabId } from '#src/recap/domain/ids.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import type { RecapCause } from '#src/recap/domain/recap-cause.ts';
import type { HistoryFact } from '#src/ports/ledger.ts';
import { RecapJob, type RecapJobDeps } from './recap-job.ts';

export type ScopeId = TabId;
export type FollowedSession = Lane;

export type EngineSource = Pick<RecapJobDeps, 'transcripts'>;
export type EngineStore = Pick<RecapJobDeps, 'records' | 'ledger'>;
export type EngineModels = Pick<RecapJobDeps, 'summarizer' | 'enumerator'>;
export type EngineEnvironment = Pick<RecapJobDeps, 'clock' | 'repos' | 'log'>;
export type EngineSettings = Pick<RecapJobDeps, 'language' | 'writerView' | 'keepInput' | 'pipeline' | 'debounce'>;

export interface EnginePlugs extends Pick<RecapJobDeps, 'ran'> {
    readonly source: EngineSource;
    readonly store: EngineStore;
    readonly models: EngineModels;
    readonly environment: EngineEnvironment;
    readonly settings: EngineSettings;
}

export interface Engine {
    turnEnded(scope: ScopeId, sessions: readonly FollowedSession[], cause: RecapCause): void;
    refresh(scope: ScopeId, sessions: readonly FollowedSession[]): Promise<void>;
    sessionStarted(scope: ScopeId, sessions: readonly FollowedSession[]): void;
    compacted(scope: ScopeId, sessions: readonly FollowedSession[]): Promise<void>;
    history(scope: ScopeId, session: FollowedSession): readonly HistoryFact[];
}

export function createEngine(plugs: EnginePlugs): Engine {
    const { source, store, models, environment, settings, ...observer } = plugs;
    const job = new RecapJob({ ...source, ...store, ...models, ...environment, ...settings, ...observer });
    return {
        turnEnded: (scope, sessions, cause): void => { job.request(scope, sessions, cause); },
        refresh: (scope, sessions): Promise<void> => job.refreshNow(scope, sessions),
        sessionStarted: (): void => undefined,
        compacted: (scope, sessions): Promise<void> => job.refreshNow(scope, sessions),
        history: (scope, session): readonly HistoryFact[] => store.ledger.historyOf(String(scope), String(session.pane)),
    };
}
