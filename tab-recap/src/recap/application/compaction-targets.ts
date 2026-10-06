// Which agents of a tab a compaction reaches. Pure.
import { COMPACTABLE } from '#src/recap/domain/compaction.ts';
import type { CompactTarget } from '#src/recap/domain/compaction.ts';
import type { Lane } from '#src/recap/domain/lane.ts';

/** The lanes this plugin knows how to compact. */
export const compactable = (lanes: readonly Lane[]): readonly Lane[] => lanes.filter((lane) => COMPACTABLE.includes(String(lane.agent)));

/**
 * `pane`: the agent the operator pointed at (null: not said); `focused`: the pane herdr focuses in the tab (null: unknown).
 * An agent named by pane is that one (a pane that is not an agent, such as the column the key was pressed in, names none); `focused` means the focused agent, or the only agent there is; `all` and kinds are what they say.
 */
export function targetsOf(lanes: readonly Lane[], setting: CompactTarget, where: { readonly pane: string | null; readonly focused: string | null }): readonly Lane[] {
    const eligible = compactable(lanes);
    const named = eligible.filter((lane) => String(lane.pane) === where.pane);
    if (named.length > 0) {
        return named;
    }
    if (setting.kind === 'all') {
        return eligible;
    }
    if (setting.kind === 'kinds') {
        return eligible.filter((lane) => setting.kinds.includes(String(lane.agent)));
    }
    const focused = eligible.filter((lane) => String(lane.pane) === where.focused);
    return focused.length > 0 || lanes.length !== 1 ? focused : eligible;
}
