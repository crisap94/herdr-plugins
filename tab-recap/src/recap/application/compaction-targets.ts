import { COMPACTABLE } from '@stateforge-labs/session-ledger';
import type { CompactTarget } from '@stateforge-labs/session-ledger';
import type { FollowedSession } from '#src/recap/domain/lane.ts';
import { parsePaneId, parseTabId } from '#src/recap/domain/ids.ts';
import type { SessionKey, ScopeId } from '#src/recap/domain/ids.ts';
import type { CompactAsk } from '#src/ports/requests.ts';
import type { CompactionPorts } from './compaction-deps.ts';
import { textOf } from '@stateforge-labs/session-ledger';

export interface TargetWhere {
    readonly pane: SessionKey | null;
    readonly focused: SessionKey | null;
}

export const compactable = (lanes: readonly FollowedSession[]): readonly FollowedSession[] => lanes.filter((lane) => COMPACTABLE.some((kind) => kind === String(lane.agent)));

export function targetsOf(lanes: readonly FollowedSession[], setting: CompactTarget, where: TargetWhere): readonly FollowedSession[] {
    const eligible = compactable(lanes);
    const named = eligible.filter((lane) => lane.pane === where.pane);
    if (named.length > 0) {
        return named;
    }
    if (setting.kind === 'all') {
        return eligible;
    }
    if (setting.kind === 'kinds') {
        return eligible.filter((lane) => setting.kinds.includes(textOf(String(lane.agent))));
    }
    const focused = eligible.filter((lane) => lane.pane === where.focused);
    return focused.length > 0 || lanes.length !== 1 ? focused : eligible;
}

export interface Scope {
    readonly tab: ScopeId;
    readonly lanes: readonly FollowedSession[];
    readonly targets: readonly FollowedSession[];
}

type Targeting = Pick<CompactionPorts, 'lanes' | 'focused' | 'target'>;

async function targetsFor(deps: Targeting, request: CompactAsk, tab: ScopeId, lanes: readonly FollowedSession[]): Promise<readonly FollowedSession[]> {
    const asked = request.pane === null ? null : parsePaneId(request.pane);
    if (asked !== null && asked.kind === 'err') return [];
    const focused = await deps.focused(tab);
    const seen = focused === null ? null : parsePaneId(focused);
    return targetsOf(lanes, deps.target(), { pane: asked === null ? null : asked.value, focused: seen === null || seen.kind === 'err' ? null : seen.value });
}

export async function scopeOf(deps: Targeting, request: CompactAsk): Promise<Scope | null> {
    const parsed = parseTabId(request.tab);
    if (parsed.kind === 'err') return null;
    const lanes = deps.lanes(parsed.value);
    const targets = await targetsFor(deps, request, parsed.value, lanes);
    return targets.length === 0 ? null : { tab: parsed.value, lanes, targets };
}
