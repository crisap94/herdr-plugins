import type { Engine, FollowedSession as Followed, SessionKey } from '@stateforge-labs/session-ledger';
import type { HistoryFact } from '@stateforge-labs/session-ledger';
import type { RecapCause } from '@stateforge-labs/session-ledger';
import type { ScopeId } from '#src/recap/domain/ids.ts';
import type { FlushWhy } from '#src/recap/domain/flush-why.ts';
import type { FollowedSession } from '#src/recap/domain/lane.ts';
import { followedOf, keyOf, scopeOf } from './engine-adapter.ts';

export interface TabRecaps {
    sync(tab: ScopeId, lanes: readonly FollowedSession[]): void;
    turnEnded(tab: ScopeId, lanes: readonly FollowedSession[], cause: RecapCause): void;
    refresh(tab: ScopeId, lanes: readonly FollowedSession[]): Promise<void>;
    flush(tab: ScopeId, why?: FlushWhy): Promise<void>;
    flushAll(): Promise<void>;
    history(tab: ScopeId, lane: FollowedSession): readonly HistoryFact[];
}

export function tabRecaps(engine: Engine): TabRecaps {
    const remembered = new Map<ScopeId, readonly SessionKey[]>();
    const sync = (tab: ScopeId, lanes: readonly FollowedSession[]): void => {
        const scope = scopeOf(tab);
        if (scope === null) {
            return;
        }
        const sessions = lanes.flatMap((lane): Followed[] => {
            const session = followedOf(lane);
            return session === null ? [] : [session];
        });
        const keys = sessions.map((session) => session.key);
        const previous = remembered.get(tab) ?? [];
        if (JSON.stringify(previous) !== JSON.stringify(keys)) {
            for (const key of previous) {
                engine.unfollow(scope, key);
            }
        }
        for (const session of sessions) {
            engine.follow(scope, session);
        }
        remembered.set(tab, keys);
    };
    return {
        sync,
        turnEnded: (tab: ScopeId, lanes: readonly FollowedSession[], cause: RecapCause): void => {
            sync(tab, lanes);
            const scope = scopeOf(tab);
            if (scope !== null) {
                engine.turnEnded(scope, null, cause, lanes.some((lane) => lane.status === 'blocked') ? 'needs-you' : 'none');
            }
        },
        refresh: (tab: ScopeId, lanes: readonly FollowedSession[]): Promise<void> => {
            sync(tab, lanes);
            const scope = scopeOf(tab);
            return scope === null ? Promise.resolve() : engine.refresh(scope);
        },
        flush: (tab: ScopeId, why?: FlushWhy): Promise<void> => {
            const scope = scopeOf(tab);
            return scope === null ? Promise.resolve() : engine.flush(scope, why);
        },
        flushAll: (): Promise<void> => engine.flushAll(),
        history: (tab: ScopeId, lane: FollowedSession): readonly HistoryFact[] => {
            const scope = scopeOf(tab);
            const key = keyOf(lane.pane);
            return scope === null || key === null ? [] : engine.history(scope, key);
        },
    };
}
