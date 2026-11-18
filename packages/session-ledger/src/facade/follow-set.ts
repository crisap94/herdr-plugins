import type { ScopeId, SessionKey } from '#src/contract/ids.ts';
import type { Lane } from '#src/recap/domain/lane-shape.ts';

export interface FollowSet {
    follow(scope: ScopeId, key: SessionKey, lane: Lane): void;
    unfollow(scope: ScopeId, key: SessionKey): void;
    followed(scope: ScopeId, key: SessionKey): Lane | undefined;
    lanesOf(scope: ScopeId): readonly Lane[];
    find(scope: ScopeId, key: SessionKey): Lane | undefined;
    entries(): readonly (readonly [ScopeId, readonly Lane[]])[];
}

const remember = (into: Map<ScopeId, Map<SessionKey, Lane>>, scope: ScopeId, key: SessionKey, lane: Lane): void => {
    const lanes = into.get(scope) ?? new Map<SessionKey, Lane>();
    lanes.set(key, lane);
    into.set(scope, lanes);
};

export function createFollowSet(): FollowSet {
    const followed = new Map<ScopeId, Map<SessionKey, Lane>>();
    const seen = new Map<ScopeId, Map<SessionKey, Lane>>();
    return {
        follow: (scope, key, lane): void => {
            remember(followed, scope, key, lane);
            remember(seen, scope, key, lane);
        },
        unfollow: (scope, key): void => {
            followed.get(scope)?.delete(key);
        },
        followed: (scope, key): Lane | undefined => followed.get(scope)?.get(key),
        lanesOf: (scope): readonly Lane[] => [...(followed.get(scope)?.values() ?? [])],
        find: (scope, key): Lane | undefined => seen.get(scope)?.get(key),
        entries: (): readonly (readonly [ScopeId, readonly Lane[]])[] => [...followed].map(([scope, lanes]) => [scope, [...lanes.values()]] as const),
    };
}
