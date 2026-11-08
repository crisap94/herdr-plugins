import { err, ok, must, type Result } from '#src/protocol/result.ts';
import { parseCount, type Count } from './count.ts';
import type { TabId } from './ids.ts';
import { parseNonEmptyText, type NonEmptyText } from './text.ts';
import { fitGuiTab } from './gui-fit.ts';
import { GUI_TAB_V1, GUI_TAB_VERSION, type GuiLaneV1, type GuiTab } from './gui-tab-types.ts';

export { GUI_TAB_V1, GUI_TAB_VERSION };
export type * from './gui-tab-types.ts';
export * from './gui-index.ts';
export const GUI_TAB_LIMIT = 1024 * 1024;

export interface TooLarge {
    readonly kind: 'too-large';
    readonly bytes: Count;
}

const URGENCY = ['blocked', 'working', 'done', 'idle'];

export const IDLE = must(parseNonEmptyText('idle'));

export function worstStatus(lanes: readonly GuiLaneV1[]): NonEmptyText {
    const found = URGENCY.find((status) => lanes.some((lane) => lane.status === status));
    return found === undefined ? IDLE : must(parseNonEmptyText(found));
}

export function encodeGuiTab(tab: GuiTab): Result<NonEmptyText, TooLarge> {
    const text = JSON.stringify(fitGuiTab(tab, must(parseCount(GUI_TAB_LIMIT))));
    const bytes = must(parseCount(Buffer.byteLength(text)));
    return bytes > GUI_TAB_LIMIT ? err({ kind: 'too-large', bytes }) : ok(must(parseNonEmptyText(text)));
}

export function guiFileName(tab: TabId): NonEmptyText {
    return must(parseNonEmptyText(`${encodeURIComponent(tab)}.json`));
}
