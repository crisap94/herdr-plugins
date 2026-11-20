import type { Engine, FollowedSession, SessionKey } from '@stateforge-labs/session-ledger';
import type { HistoryFact } from '#src/ports/ledger.ts';
import type { RecapCause } from '#src/recap/domain/recap-cause.ts';
import type { TabId } from '#src/recap/domain/ids.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import { followedOf, keyOf, scopeOf } from './engine-adapter.ts';

export interface TabRecaps {
    sync(tab: TabId, lanes: readonly Lane[]): void;
    turnEnded(tab: TabId, lanes: readonly Lane[], cause: RecapCause): void;
    refresh(tab: TabId, lanes: readonly Lane[]): Promise<void>;
    flush(tab: TabId): Promise<void>;
    flushAll(): Promise<void>;
    history(tab: TabId, lane: Lane): readonly HistoryFact[];
}

export function tabRecaps(engine: Engine): TabRecaps {
    const remembered = new Map<TabId, readonly SessionKey[]>();
    const sync = (tab: TabId, lanes: readonly Lane[]): void => {
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
        turnEnded: (tab: TabId, lanes: readonly Lane[], cause: RecapCause): void => {
            sync(tab, lanes);
            const scope = scopeOf(tab);
            if (scope !== null) {
                engine.turnEnded(scope, null, cause);
            }
        },
        refresh: (tab: TabId, lanes: readonly Lane[]): Promise<void> => {
            sync(tab, lanes);
            const scope = scopeOf(tab);
            return scope === null ? Promise.resolve() : engine.refresh(scope);
        },
        flush: (tab: TabId): Promise<void> => {
            const scope = scopeOf(tab);
            return scope === null ? Promise.resolve() : engine.flush(scope);
        },
        flushAll: (): Promise<void> => engine.flushAll(),
        history: (tab: TabId, lane: Lane): readonly HistoryFact[] => {
            const scope = scopeOf(tab);
            const key = keyOf(lane.pane);
            return scope === null || key === null ? [] : engine.history(scope, key);
        },
    };
}
