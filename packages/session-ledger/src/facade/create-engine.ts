import type { CreateEngine, Engine } from '#src/contract/engine.ts';
import type { HistoryFact } from '#src/contract/facts.ts';
import type { ScopeId, SessionKey } from '#src/contract/ids.ts';
import type { FollowedSession, RecapCause } from '#src/contract/session.ts';
import { createEngine as createLegacyEngine, type Engine as LegacyEngine } from '#src/recap/application/engine.ts';
import type { RunEvent } from '#src/recap/application/ledger-reconcile.ts';
import { compacted } from './compacted.ts';
import { curate } from './curate.ts';
import { createFollowSet } from './follow-set.ts';
import { followedBy, type FollowedBy } from './followed-by.ts';
import { legacyPlugsOf, type FacadePlugs } from './plugs.ts';
import { sessionStarted } from './session-started.ts';
import { laneOf, tabOf, writtenOf } from './translate.ts';

const reportWritten = (plugs: FacadePlugs) => (event: RunEvent): void => {
    const written = writtenOf(event);
    if (written === null) {
        plugs.environment.log(`engine-adapter: recap-written skipped, the tab id is empty: ${event.tab}`);
        return;
    }
    plugs.on?.(written);
};

const legacyOf = (plugs: FacadePlugs): LegacyEngine => createLegacyEngine({
    source: plugs.source,
    store: plugs.store,
    models: plugs.models,
    environment: plugs.environment,
    settings: plugs.settings,
    ran: reportWritten(plugs),
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
        sessionStarted: (scope, key): void => {
            sessionStarted(set, legacy, scope, key);
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
