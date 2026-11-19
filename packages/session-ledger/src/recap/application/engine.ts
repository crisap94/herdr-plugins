import type { Lane, PaneId, TabId } from '#src/recap/domain/lane-shape.ts';
import type { RecapCause } from '#src/recap/domain/recap-cause.ts';
import type { HistoryFact } from '#src/ports/ledger.ts';
import type { LastRun } from '#src/ports/recap-records.ts';
import type { Fact } from '#src/recap/domain/fact.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import { CLOSED_SHOWN_MS } from './ledger-input.ts';
import { RecapJob, type RecapJobDeps } from './recap-job.ts';

export type ScopeId = TabId;
export type FollowedSession = Lane;

export type EngineSource = Pick<RecapJobDeps, 'transcripts'>;
export type EngineStore = Pick<RecapJobDeps, 'records' | 'ledger'>;
export type EngineModels = Pick<RecapJobDeps, 'summarizer' | 'enumerator'>;
export type EngineEnvironment = Pick<RecapJobDeps, 'clock' | 'repos' | 'log'>;
export type EngineSettings = Pick<RecapJobDeps, 'language' | 'writerView' | 'keepInput' | 'pipeline' | 'closeEvidence' | 'debounce'>;

export interface EnginePlugs extends Pick<RecapJobDeps, 'ran'> {
    readonly source: EngineSource;
    readonly store: EngineStore;
    readonly models: EngineModels;
    readonly environment: EngineEnvironment;
    readonly settings: EngineSettings;
}

export interface RestoreFacts {
    readonly at: Instant;
    readonly lastRun: LastRun | null;
    readonly open: readonly Fact[];
    readonly closed: readonly Fact[];
}

export interface Engine {
    turnEnded(scope: ScopeId, sessions: readonly FollowedSession[], cause: RecapCause): void;
    refresh(scope: ScopeId, sessions: readonly FollowedSession[]): Promise<void>;
    sessionStarted(scope: ScopeId, sessions: readonly FollowedSession[]): void;
    compacted(scope: ScopeId, sessions: readonly FollowedSession[]): Promise<void>;
    history(scope: ScopeId, session: FollowedSession): readonly HistoryFact[];
    restore(scope: ScopeId, session: FollowedSession): RestoreFacts;
}

const heldBy = (session: FollowedSession): PaneId => session.pane;

function restoreFactsOf(store: EngineStore, at: Instant, scope: ScopeId, session: FollowedSession): RestoreFacts {
    const id = String(scope);
    const recap = store.records.readRecap(id);
    const tasks = (recap === null || 'kind' in recap ? [] : recap.tasks).filter((task) => task.lanes.includes(String(heldBy(session))));
    const facts = tasks.map((task) => {
        const owned = { tab: id, key: task.id };
        const open = store.ledger.openOf(owned);
        const closed = store.ledger.recentlyClosed(owned, at - CLOSED_SHOWN_MS);
        return { open: 'kind' in open ? [] : open, closed: 'kind' in closed ? [] : closed };
    });
    return { at, lastRun: store.records.lastRunOf(id), open: facts.flatMap((task) => task.open), closed: facts.flatMap((task) => task.closed) };
}

export function createEngine(plugs: EnginePlugs): Engine {
    const { source, store, models, environment, settings, ...observer } = plugs;
    const job = new RecapJob({ ...source, ...store, ...models, ...environment, ...settings, ...observer });
    return {
        turnEnded: (scope, sessions, cause): void => { job.request(scope, sessions, cause); },
        refresh: (scope, sessions): Promise<void> => job.refreshNow(scope, sessions),
        sessionStarted: (): void => undefined,
        compacted: (scope, sessions): Promise<void> => job.refreshNow(scope, sessions),
        history: (scope, session): readonly HistoryFact[] => store.ledger.historyOf(String(scope), String(heldBy(session))),
        restore: (scope, session): RestoreFacts => restoreFactsOf(store, environment.clock.now(), scope, session),
    };
}
