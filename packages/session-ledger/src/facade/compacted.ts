import { brand } from '#src/recap/domain/brand.ts';
import type { RestoreText, ScopeId, SessionKey } from '#src/contract/ids.ts';
import type { Engine as LegacyEngine } from '#src/recap/application/engine.ts';
import type { FollowSet } from './follow-set.ts';
import type { RestoreHooks } from './plugs.ts';
import { emptyRestore, tabOf } from './translate.ts';

const RESTORE_BYTES = 16_384;

export function compacted(set: FollowSet, legacy: LegacyEngine, restore: RestoreHooks, scope: ScopeId, key: SessionKey): RestoreText {
    const tabId = tabOf(scope);
    const followed = set.find(scope, key);
    if (tabId === null || followed === undefined) {
        return emptyRestore();
    }
    const facts = legacy.restore(tabId, followed);
    void legacy.refresh(tabId, set.lanesOf(scope));
    if (facts.lastRun === null) {
        return emptyRestore();
    }
    const text = restore.render(facts) ?? facts.open.map((fact) => fact.text).join('\n');
    const bytes = new TextEncoder().encode(text);
    const limit = restore.bytes() ?? RESTORE_BYTES;
    if (bytes.length <= limit) {
        return brand<string, 'RestoreText'>(text);
    }
    let end = limit;
    while (end > 0 && ((bytes[end] ?? 0) & 0xc0) === 0x80) {
        end -= 1;
    }
    return brand<string, 'RestoreText'>(new TextDecoder().decode(bytes.subarray(0, end)));
}
