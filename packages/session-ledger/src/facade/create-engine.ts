import type { CreateEngine, Engine } from '#src/contract/engine.ts';
import type { HistoryFact } from '#src/contract/facts.ts';
import type { ScopeId, SessionKey } from '#src/contract/ids.ts';
import type { FollowedSession, RecapCause } from '#src/contract/session.ts';
import { createEngine as createLegacyEngine, type Engine as LegacyEngine, type EngineStore } from '#src/recap/application/engine.ts';
import type { RunEvent } from '#src/recap/application/ledger-reconcile.ts';
import { compacted } from './compacted.ts';
import { curate } from './curate.ts';
import { createFollowSet } from './follow-set.ts';
import { followedBy, type FollowedBy } from './followed-by.ts';
import { legacyPlugsOf, type FacadePlugs } from './plugs.ts';
import { sessionStarted, type Retired, type Started } from './session-started.ts';
import type { Advance, LaneCursor } from '#src/ports/recap-records.ts';
import { laneOf, tabOf, writtenOf } from './translate.ts';

const reportWritten = (plugs: FacadePlugs) => (event: RunEvent): void => {
    const written = writtenOf(event);
    if (written === null) {
        plugs.environment.log(`engine-adapter: recap-written skipped, the tab id is empty: ${event.tab}`);
        return;
    }
    plugs.on?.(written);
};

type Moved = Pick<Advance, 'tab' | 'lanes'>;

const unread = (cursors: readonly LaneCursor[], read: readonly LaneCursor[]): readonly LaneCursor[] =>
    cursors.filter((cursor) => !read.some((other) => other.pane === cursor.pane && other.transcript === cursor.transcript));

const createRetired = (): Retired => {
    const kept = new Map<string, readonly LaneCursor[]>();
    const withKept = (move: Moved): readonly LaneCursor[] => [...move.lanes, ...unread(kept.get(move.tab) ?? [], move.lanes)];
    return {
        keep: (recap, was): void => {
            kept.set(recap.tab, [...unread(kept.get(recap.tab) ?? [], recap.lanes), ...recap.lanes.filter((cursor) => cursor.pane === String(was.pane))]);
        },
        over: (store): EngineStore => ({
            ...store,
            records: {
                readRecap: store.records.readRecap.bind(store.records),
                lastRunOf: store.records.lastRunOf.bind(store.records),
                beginRun: store.records.beginRun.bind(store.records),
                recordRun: (run): void => {
                    store.records.recordRun({ ...run, lanes: withKept(run) });
                },
                failRun: (run): void => {
                    store.records.failRun({ ...run, lanes: withKept(run) });
                },
                advance: (move): void => {
                    store.records.advance({ ...move, lanes: withKept(move) });
                },
            },
        }),
    };
};

const legacyOf = (plugs: FacadePlugs, retired: Retired): LegacyEngine => createLegacyEngine({
    source: plugs.source,
    store: retired.over(plugs.store),
    models: plugs.models,
    environment: plugs.environment,
    settings: plugs.settings,
    ran: reportWritten(plugs),
});

export type { FacadePlugs };

export function engineOver(plugs: FacadePlugs): Engine {
    const set = createFollowSet();
    const retired = createRetired();
    const legacy = legacyOf(plugs, retired);
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
        turnEnded: (scope: ScopeId, key: SessionKey | null, cause: RecapCause): void => {
            const tab = tabOf(scope);
            if (tab === null) {
                return;
            }
            if (key !== null && set.followed(scope, key) === undefined) {
                plugs.environment.log(`engine-adapter: turn ended for a session that is not followed: ${scope} ${key}`);
                return;
            }
            legacy.turnEnded(tab, set.lanesOf(scope), cause);
        },
        sessionStarted: (scope: ScopeId, key: SessionKey, now: Started): void => {
            if (set.followed(scope, key) === undefined) {
                plugs.environment.log(`engine-adapter: session started for a key that is not followed: ${scope} ${key}`);
                return;
            }
            sessionStarted(set, legacy, { retired, store: plugs.store }, { scope, key }, now);
        },
        refresh: (scope: ScopeId): Promise<void> => {
            const tab = tabOf(scope);
            return tab === null ? Promise.resolve() : legacy.refresh(tab, set.lanesOf(scope));
        },
        compacted: (scope) => compacted(set, legacy, scope),
        history: (scope: ScopeId, key: SessionKey): readonly HistoryFact[] => {
            const tab = tabOf(scope);
            const lane = set.find(scope, key);
            if (tab === null || lane === undefined) {
                plugs.environment.log(`engine-adapter: history skipped, the session was never followed: ${scope} ${key}`);
                return [];
            }
            return legacy.history(tab, lane);
        },
        curate: (scope) => curate(scope),
    };
}

export const createEngine: CreateEngine = (plugs) => engineOver(legacyPlugsOf(plugs));
