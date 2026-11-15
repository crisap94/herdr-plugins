import type { RecapRecords } from '#src/ports/recap-records.ts';
import type { TabViews } from '#src/ports/tab-views.ts';
import { NO, YES, type Flag } from '#src/recap/domain/gui-tab-parts.ts';
import { NO_SECTIONS } from '#src/recap/domain/shape.ts';
import type { PaneId, TabId } from '#src/recap/domain/ids.ts';
import type { Text } from '#src/recap/domain/text.ts';
import { collapsedText } from '#src/recap/domain/text-collapse.ts';
import { requestNoteOf } from './compact-start.ts';
import { guidanceOf, NOTE_LIMIT, type Material } from './compaction-message.ts';

export type CompactRefusal = 'note-too-long' | 'unknown-pane';

export type CompactPreview =
    | { readonly kind: 'guidance'; readonly text: Text }
    | { readonly kind: 'refused'; readonly reason: CompactRefusal };

export interface CompactPreviewDeps {
    readonly records: Pick<RecapRecords, 'readRecap'>;
    readonly views: Pick<TabViews, 'readTab'>;
}

const refused = (reason: CompactRefusal): CompactPreview => ({ kind: 'refused', reason });

const listed = (deps: CompactPreviewDeps, tab: TabId, pane: PaneId): Flag => {
    const live = deps.views.readTab(tab)?.lanes.some((each) => each.pane === pane) === true;
    return live || deps.records.readRecap(tab)?.lanes.some((each) => each.pane === pane) === true ? YES : NO;
};

function materialOf(deps: CompactPreviewDeps, tab: TabId, pane: PaneId, note: Text | null): Material | null {
    if (listed(deps, tab, pane) === NO) { return null; }
    const web = deps.views.readTab(tab)?.lanes.find((each) => each.pane === pane)?.web ?? null;
    const tasks = deps.records.readRecap(tab)?.tasks ?? [];
    const task = tasks.find((each) => each.lanes.includes(pane)) ?? tasks[0];
    return { sections: task?.sections ?? NO_SECTIONS, web, note };
}

export function compactPreviewOf(deps: CompactPreviewDeps, tab: TabId, pane: PaneId, note: Text): CompactPreview {
    if (Array.from(collapsedText(note, 'remove')).length > NOTE_LIMIT) { return refused('note-too-long'); }
    const material = materialOf(deps, tab, pane, requestNoteOf(note));
    if (material === null) { return refused('unknown-pane'); }
    return { kind: 'guidance', text: guidanceOf(material) };
}
