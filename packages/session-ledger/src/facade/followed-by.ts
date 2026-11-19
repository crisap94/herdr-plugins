import type { HarnessKind, ScopeId, SessionId, SessionKey } from '#src/contract/ids.ts';
import type { FollowSet } from './follow-set.ts';
import { followedOf } from './translate.ts';

export interface FollowedBy {
    readonly scope: ScopeId;
    readonly key: SessionKey;
}

export function followedBy(set: FollowSet, harness: HarnessKind, session: SessionId): FollowedBy | null {
    let found: FollowedBy | null = null;
    for (const [scope, items] of set.entries()) {
        for (const item of items) {
            const followed = followedOf(item);
            if (followed !== null && followed.harness === harness && followed.session === session) {
                found = { scope, key: followed.key };
            }
        }
    }
    return found;
}
