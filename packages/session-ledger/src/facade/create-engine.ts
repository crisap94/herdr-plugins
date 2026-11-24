import type { Attention, CreateEngine, Engine, FlushWhy } from '#src/contract/engine.ts';
import type { HistoryFact } from '#src/contract/facts.ts';
import type { AccomplishmentEstablished, LedgerEvent, TurnRecorded } from '#src/contract/events.ts';
import { instant } from '#src/contract/kernel.ts';
import { parseSessionKey, type ScopeId, type SessionKey } from '#src/contract/ids.ts';
import type { FollowedSession, RecapCause } from '#src/contract/session.ts';
import { createEngine as createLegacyEngine, type Engine as LegacyEngine, type EngineStore } from '#src/recap/application/engine.ts';
import type { RunAccomplishment, RecapWritten, RunTurn } from '#src/recap/application/ledger-reconcile.ts';
import { compacted } from './compacted.ts';
import { createFollowSet } from './follow-set.ts';
import { followedBy, type FollowedBy } from './followed-by.ts';
import { legacyPlugsOf, type FacadePlugs, type RestoreHooks } from './plugs.ts';
import { sessionStarted, type Started } from './session-started.ts';
import type { Advance, SessionCursor } from '#src/ports/recap-records.ts';
import { historyOf, laneOf, tabOf, writtenOf } from './translate.ts';

const NO_RESTORE: RestoreHooks = { bytes: () => undefined, render: () => undefined };

const emit = (plugs: FacadePlugs, make: () => LedgerEvent | null): void => {
    try {
        const event = make();
        if (event !== null) {
            plugs.on?.(event);
        }
    } catch (error) {
        plugs.environment.log(`engine-adapter: ledger event failed: ${error instanceof Error ? error.message : String(error)}`);
    }
};

const turnOf = (scope: ScopeId, turn: RunTurn): TurnRecorded | null => {
    const read = parseSessionKey(turn.key);
    return read.kind === 'ok' ? { kind: 'turn-recorded', scope, key: read.value, at: instant(turn.at) } : null;
};

const accomplishmentOf = (scope: ScopeId, done: RunAccomplishment): AccomplishmentEstablished => ({
    kind: 'accomplishment-established',
    scope,
    task: done.fact.task,
    sessions: done.task.sessions.flatMap((member) => {
        const read = parseSessionKey(member);
        return read.kind === 'ok' ? [read.value] : [];
    }),
    fact: done.fact,
    at: instant(done.at),
});

const afterRunFailed = (plugs: FacadePlugs, scope: ScopeId) => (error: Error): void => {
    plugs.environment.log(`curator ${scope}: ${error.message}`);
};

const startedAfterRun = (plugs: FacadePlugs, scope: ScopeId, event: RecapWritten): void => {
    const failed = afterRunFailed(plugs, scope);
    try {
        plugs.afterRun?.(scope, event).catch(failed);
    } catch (error) {
        failed(error instanceof Error ? error : new Error(String(error)));
    }
};

const reportRun = (plugs: FacadePlugs) => (event: RecapWritten): void => {
    const written = writtenOf(event);
    if (written === null) {
        plugs.environment.log(`engine-adapter: run events skipped, the tab id is empty: ${event.tab}`);
        return;
    }
    const { scope } = written;
    for (const turn of event.entries ?? []) {
        emit(plugs, () => turnOf(scope, turn));
    }
    for (const done of event.established ?? []) {
        emit(plugs, () => accomplishmentOf(scope, done));
    }
    emit(plugs, () => written);
    startedAfterRun(plugs, scope, event);
};

type Moved = Pick<Advance, 'scope' | 'sessions'>;

const unread = (cursors: readonly SessionCursor[], read: readonly SessionCursor[]): readonly SessionCursor[] =>
    cursors.filter((cursor) => !read.some((other) => other.key === cursor.key && other.transcript === cursor.transcript));

const after = <F extends (...args: never[]) => ReturnType<F>>(call: F, then: (result: ReturnType<F>) => ReturnType<F>) => (...args: Parameters<F>): ReturnType<F> => then(call(...args));

const OLD_CURSORS_PER_PANE = 4;

const keptOver = (store: EngineStore): EngineStore => {
    const read = new Map<string, readonly SessionCursor[]>();
    const withKept = (move: Moved): readonly SessionCursor[] => {
        const old = unread(read.get(move.scope) ?? [], move.sessions);
        const held = old.filter((cursor, at) => {
            const same = [...move.sessions, ...old.slice(0, at)].filter((other) => other.key === cursor.key);
            const current = same.filter((other) => move.sessions.includes(other)).length;
            return current > 0 && same.length - current < OLD_CURSORS_PER_PANE;
        });
        return [...move.sessions, ...held];
    };
    const seen = (found: ReturnType<EngineStore['records']['readRecap']>): ReturnType<EngineStore['records']['readRecap']> => {
        if (found !== null && !('kind' in found)) read.set(found.scope, found.sessions);
        return found;
    };
    return {
        ...store,
        records: {
            readRecap: after(store.records.readRecap.bind(store.records), seen),
            lastRunOf: store.records.lastRunOf.bind(store.records),
            beginRun: store.records.beginRun.bind(store.records),
            recordRun: (run): void => {
                store.records.recordRun({ ...run, sessions: withKept(run) });
            },
            failRun: (run): void => {
                store.records.failRun({ ...run, sessions: withKept(run) });
            },
            advance: (move): void => {
                store.records.advance({ ...move, sessions: withKept(move) });
            },
        },
    };
};

const legacyOf = (plugs: FacadePlugs): LegacyEngine => createLegacyEngine({
    source: plugs.source,
    store: keptOver(plugs.store),
    models: plugs.models,
    environment: plugs.environment,
    settings: plugs.settings,
    ran: reportRun(plugs),
});

export type { FacadePlugs };

export function engineOver(plugs: FacadePlugs): Engine {
    const set = createFollowSet();
    const legacy = legacyOf(plugs);
    return {
        follow: (scope: ScopeId, session: FollowedSession): void => {
            const lane = laneOf(scope, session);
            if (lane === null) {
                plugs.environment.log(`engine-adapter: follow skipped, an id is empty: ${scope} ${session.key}`);
                return;
            }
            set.follow(scope, session.key, lane);
        },
        unfollow: (scope: ScopeId, key: SessionKey): void => {
            set.unfollow(scope, key);
        },
        followedBy: (harness, session): FollowedBy | null => followedBy(set, harness, session),
        turnEnded: (scope: ScopeId, key: SessionKey | null, cause: RecapCause, attention: Attention = 'none'): void => {
            const tab = tabOf(scope);
            if (tab === null) {
                return;
            }
            if (key !== null && set.followed(scope, key) === undefined) {
                plugs.environment.log(`engine-adapter: turn ended for a session that is not followed: ${scope} ${key}`);
                return;
            }
            const followed = set.lanesOf(scope);
            legacy.turnEnded(tab, attention === 'needs-you' ? followed.map((one) => ({ ...one, status: 'blocked' as const })) : followed, cause);
        },
        sessionStarted: (scope: ScopeId, key: SessionKey, now: Started): void => {
            if (set.followed(scope, key) === undefined) {
                plugs.environment.log(`engine-adapter: session started for a key that is not followed: ${scope} ${key}`);
                return;
            }
            sessionStarted(set, legacy, { scope, key }, now);
        },
        refresh: (scope: ScopeId): Promise<void> => {
            const tab = tabOf(scope);
            return tab === null ? Promise.resolve() : legacy.refresh(tab, set.lanesOf(scope));
        },
        flush: (scope: ScopeId, why?: FlushWhy): Promise<void> => { const id = tabOf(scope); return id === null ? Promise.resolve() : legacy.flush(id, why); },
        flushAll: (): Promise<void> => legacy.flushAll(),
        compacted: (scope, key) => compacted(set, legacy, plugs.restore ?? NO_RESTORE, scope, key),
        history: (scope: ScopeId, key: SessionKey): readonly HistoryFact[] => {
            const tab = tabOf(scope);
            const lane = set.find(scope, key);
            if (tab === null || lane === undefined) {
                plugs.environment.log(`engine-adapter: history skipped, the session was never followed: ${scope} ${key}`);
                return [];
            }
            return historyOf(legacy.history(tab, lane));
        },
        curate: async (scope: ScopeId): Promise<void> => {
            const held = tabOf(scope);
            if (held !== null) {
                await legacy.idle(held);
            }
            await plugs.curate?.(scope);
        },
    };
}

export const createEngine: CreateEngine = (plugs) => engineOver(legacyPlugsOf(plugs));
