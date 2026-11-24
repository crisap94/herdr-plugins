import type { Engine, FollowedSession, SessionKey } from '@stateforge-labs/session-ledger';
import type { HistoryFact } from '#src/ports/ledger.ts';
import type { RecapCause } from '#src/recap/domain/recap-cause.ts';
import type { ScopeId } from '#src/recap/domain/ids.ts';
import type { FlushWhy } from '#src/recap/domain/flush-why.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import { followedOf, keyOf, scopeOf } from './engine-adapter.ts';

export interface TabRecaps {
    sync(tab: ScopeId, lanes: readonly Lane[]): void;
    turnEnded(tab: ScopeId, lanes: readonly Lane[], cause: RecapCause): void;
    refresh(tab: ScopeId, lanes: readonly Lane[]): Promise<void>;
    flush(tab: ScopeId, why?: FlushWhy): Promise<void>;
    flushAll(): Promise<void>;
    history(tab: ScopeId, lane: Lane): readonly HistoryFact[];
}

export function tabRecaps(engine: Engine): TabRecaps {
    const remembered = new Map<ScopeId, readonly SessionKey[]>();
    const sync = (tab: ScopeId, lanes: readonly Lane[]): void => {
        const scope = scopeOf(tab);
        if (scope === null) {
            return;
        }
        const sessions = lanes.flatMap((lane): FollowedSession[] => {
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
        turnEnded: (tab: ScopeId, lanes: readonly Lane[], cause: RecapCause): void => {
            sync(tab, lanes);
            const scope = scopeOf(tab);
            if (scope !== null) {
                engine.turnEnded(scope, null, cause, lanes.some((lane) => lane.status === 'blocked') ? 'needs-you' : 'none');
            }
        },
        refresh: (tab: ScopeId, lanes: readonly Lane[]): Promise<void> => {
            sync(tab, lanes);
            const scope = scopeOf(tab);
            return scope === null ? Promise.resolve() : engine.refresh(scope);
        },
        flush: (tab: ScopeId, why?: FlushWhy): Promise<void> => {
            const scope = scopeOf(tab);
            return scope === null ? Promise.resolve() : engine.flush(scope, why);
        },
        flushAll: (): Promise<void> => engine.flushAll(),
        history: (tab: ScopeId, lane: Lane): readonly HistoryFact[] => {
            const scope = scopeOf(tab);
            const key = keyOf(lane.pane);
            return scope === null || key === null ? [] : engine.history(scope, key);
        },
    };
}
