import type { ScopeId, SessionKey } from '#src/contract/ids.ts';
import type { Engine as LegacyEngine } from '#src/recap/application/engine.ts';
import type { FollowSet } from './follow-set.ts';

export function sessionStarted(_set: FollowSet, _legacy: LegacyEngine, _scope: ScopeId, _key: SessionKey): void {
    return undefined;
}
