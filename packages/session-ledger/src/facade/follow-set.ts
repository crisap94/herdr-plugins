import type { ScopeId, SessionKey } from '#src/contract/ids.ts';
import type { LegacyFollowedSession } from '#src/recap/domain/followed-session-shape.ts';

export interface FollowSet {
    follow(scope: ScopeId, key: SessionKey, lane: LegacyFollowedSession): void;
    unfollow(scope: ScopeId, key: SessionKey): void;
    followed(scope: ScopeId, key: SessionKey): LegacyFollowedSession | undefined;
    lanesOf(scope: ScopeId): readonly LegacyFollowedSession[];
    find(scope: ScopeId, key: SessionKey): LegacyFollowedSession | undefined;
    entries(): readonly (readonly [ScopeId, readonly LegacyFollowedSession[]])[];
}

const remember = (into: Map<ScopeId, Map<SessionKey, LegacyFollowedSession>>, scope: ScopeId, key: SessionKey, lane: LegacyFollowedSession): void => {
    const lanes = into.get(scope) ?? new Map<SessionKey, LegacyFollowedSession>();
    lanes.set(key, lane);
    into.set(scope, lanes);
};

export function createFollowSet(): FollowSet {
    const followed = new Map<ScopeId, Map<SessionKey, LegacyFollowedSession>>();
    const seen = new Map<ScopeId, Map<SessionKey, LegacyFollowedSession>>();
    return {
        follow: (scope, key, lane): void => {
            remember(followed, scope, key, lane);
            remember(seen, scope, key, lane);
        },
        unfollow: (scope, key): void => {
            followed.get(scope)?.delete(key);
        },
        followed: (scope, key): LegacyFollowedSession | undefined => followed.get(scope)?.get(key),
        lanesOf: (scope): readonly LegacyFollowedSession[] => [...(followed.get(scope)?.values() ?? [])],
        find: (scope, key): LegacyFollowedSession | undefined => seen.get(scope)?.get(key),
        entries: (): readonly (readonly [ScopeId, readonly LegacyFollowedSession[]])[] => [...followed].map(([scope, lanes]) => [scope, [...lanes.values()]] as const),
    };
}
