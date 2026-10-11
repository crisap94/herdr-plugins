import { COMPACTABLE } from '#src/recap/domain/compaction.ts';
import type { CompactTarget } from '#src/recap/domain/compaction.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import type { PaneId } from '#src/recap/domain/ids.ts';

export interface TargetWhere {
    readonly pane: PaneId | null;
    readonly focused: PaneId | null;
}

export const compactable = (lanes: readonly Lane[]): readonly Lane[] => lanes.filter((lane) => COMPACTABLE.some((kind) => kind === String(lane.agent)));

export function targetsOf(lanes: readonly Lane[], setting: CompactTarget, where: TargetWhere): readonly Lane[] {
    const eligible = compactable(lanes);
    const named = eligible.filter((lane) => lane.pane === where.pane);
    if (named.length > 0) {
        return named;
    }
    if (setting.kind === 'all') {
        return eligible;
    }
    if (setting.kind === 'kinds') {
        return eligible.filter((lane) => setting.kinds.includes(String(lane.agent)));
    }
    const focused = eligible.filter((lane) => lane.pane === where.focused);
    return focused.length > 0 || lanes.length !== 1 ? focused : eligible;
}
