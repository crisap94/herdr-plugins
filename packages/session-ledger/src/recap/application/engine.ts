import type { FlushWhy } from '#src/contract/engine.ts';
import type { Lane, PaneId, TabId } from '#src/recap/domain/lane-shape.ts';
import type { RecapCause } from '#src/recap/domain/recap-cause.ts';
import type { HistoryFact } from '#src/ports/ledger.ts';
import type { LastRun } from '#src/ports/recap-records.ts';
import type { Fact } from '#src/recap/domain/fact.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import { CLOSED_SHOWN_MS } from './ledger-input.ts';
import { RecapJob, type RecapJobDeps } from './recap-job.ts';
import { saying } from '#src/ports/unknowable.ts';

export type ScopeId = TabId;
export type FollowedSession = Lane;

export type EngineSource = Pick<RecapJobDeps, 'transcripts'>;
export type EngineStore = Pick<RecapJobDeps, 'records' | 'ledger'>;
export type EngineModels = Pick<RecapJobDeps, 'summarizer' | 'enumerator'>;
export type EngineEnvironment = Pick<RecapJobDeps, 'clock' | 'repos' | 'log' | 'mint'>;
export type EngineSettings = Pick<RecapJobDeps, 'language' | 'writerView' | 'keepInput' | 'pipeline' | 'closeEvidence' | 'debounce' | 'pacing' | 'visible'>;

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
    idle(scope: ScopeId): Promise<void>;
    flush(scope: ScopeId, why?: FlushWhy): Promise<void>;
    flushAll(): Promise<void>;
}

const heldBy = (session: FollowedSession): PaneId => session.pane;

function restoreFactsOf(store: EngineStore, environment: EngineEnvironment, at: Instant, scope: ScopeId, session: FollowedSession): RestoreFacts {
    const id = String(scope);
    const recap = store.records.readRecap(id);
    if (recap !== null && 'kind' in recap) {
        environment.log(`restore ${id}: skipped, ${saying(recap.why)}`);
        return { at, lastRun: null, open: [], closed: [] };
    }
    const tasks = (recap === null ? [] : recap.tasks).filter((task) => task.lanes.includes(String(heldBy(session))));
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
        restore: (scope, session): RestoreFacts => restoreFactsOf(store, environment, environment.clock.now(), scope, session),
        idle: (scope): Promise<void> => job.idle(scope),
        flush: (scope, why): Promise<void> => job.flush(scope, why),
        flushAll: (): Promise<void> => job.flushAll(),
    };
}
