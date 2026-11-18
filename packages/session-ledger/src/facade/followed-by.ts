import type { HarnessKind, ScopeId, SessionId, SessionKey } from '#src/contract/ids.ts';
import type { FollowSet } from './follow-set.ts';

export interface FollowedBy {
    readonly scope: ScopeId;
    readonly key: SessionKey;
}

export function followedBy(_set: FollowSet, _harness: HarnessKind, _session: SessionId): FollowedBy | null {
    return null;
}
