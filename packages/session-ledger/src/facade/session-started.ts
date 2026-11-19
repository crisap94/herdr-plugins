import type { ScopeId, SessionKey } from '#src/contract/ids.ts';
import type { FollowedSession } from '#src/contract/session.ts';
import type { Engine as LegacyEngine, EngineStore } from '#src/recap/application/engine.ts';
import type { TabRecap } from '#src/ports/recap-records.ts';
import type { FollowSet } from './follow-set.ts';
import { followedOf, laneOf, tabOf } from './translate.ts';

export type Started = Pick<FollowedSession, 'session' | 'cwd'>;

export type Followed = NonNullable<ReturnType<FollowSet['followed']>>;

export interface Retired {
    keep(recap: TabRecap, was: Followed): void;
    over(store: EngineStore): EngineStore;
}

export interface Rebinding {
    readonly retired: Retired;
    readonly store: EngineStore;
}

export interface Rebound {
    readonly scope: ScopeId;
    readonly key: SessionKey;
}

export function sessionStarted(set: FollowSet, legacy: LegacyEngine, rebinding: Rebinding, target: Rebound, now: Started): void {
    const { scope, key } = target;
    const was = set.followed(scope, key);
    const into = tabOf(scope);
    if (was === undefined || into === null) {
        return;
    }
    const followed = followedOf(was);
    const rebound = followed === null ? null : laneOf(scope, { ...followed, session: now.session, cwd: now.cwd });
    if (rebound === null) {
        return;
    }
    const stored = rebinding.store.records.readRecap(String(into));
    if (stored !== null && !('kind' in stored)) {
        rebinding.retired.keep(stored, was);
    }
    set.follow(scope, key, rebound);
    void legacy.refresh(into, set.lanesOf(scope));
}
