import type { RestoreText, ScopeId } from '#src/contract/ids.ts';
import type { Engine as LegacyEngine } from '#src/recap/application/engine.ts';
import type { FollowSet } from './follow-set.ts';
import { emptyRestore, tabOf } from './translate.ts';

export function compacted(set: FollowSet, legacy: LegacyEngine, scope: ScopeId): RestoreText {
    const tab = tabOf(scope);
    if (tab !== null) {
        void legacy.refresh(tab, set.lanesOf(scope));
    }
    return emptyRestore();
}
