import { knownOr, type GuardedRecapRecords } from '#src/ports/guarded-reads.ts';
import type { TabViewStore } from '#src/ports/tab-views.ts';
import { NO, YES, type Flag } from '#src/recap/domain/gui-tab-parts.ts';
import { NO_SECTIONS } from '#src/recap/domain/shape.ts';
import type { SessionKey, ScopeId } from '#src/recap/domain/ids.ts';
import type { Text } from '#src/recap/domain/text.ts';
import { collapsedText } from '#src/recap/domain/text-collapse.ts';
import { noteFromRequest } from './compact-start.ts';
import { guidanceOf, NOTE_LIMIT, type Material } from './compaction-message.ts';
import { textOf } from '#src/recap/domain/text.ts';

export type CompactRefusal = 'note-too-long' | 'unknown-pane';

export type CompactPreview =
    | { readonly kind: 'guidance'; readonly text: Text }
    | { readonly kind: 'refused'; readonly reason: CompactRefusal };

export interface CompactPreviewDeps {
    readonly records: Pick<GuardedRecapRecords, 'readRecap'>;
    readonly views: Pick<TabViewStore, 'readTab'>;
}

const refused = (reason: CompactRefusal): CompactPreview => ({ kind: 'refused', reason });

const listed = (deps: CompactPreviewDeps, tab: ScopeId, pane: SessionKey): Flag => {
    const live = deps.views.readTab(tab)?.lanes.some((each) => each.pane === pane) === true;
    return live || knownOr(deps.records.readRecap(tab), null)?.sessions.some((each) => each.key === pane) === true ? YES : NO;
};

function materialOf(deps: CompactPreviewDeps, tab: ScopeId, pane: SessionKey, note: Text | null): Material | null {
    if (listed(deps, tab, pane) === NO) { return null; }
    const web = deps.views.readTab(tab)?.lanes.find((each) => each.pane === pane)?.web ?? null;
    const tasks = knownOr(deps.records.readRecap(tab), null)?.tasks ?? [];
    const task = tasks.find((each) => each.sessions.includes(pane)) ?? tasks[0];
    return { sections: task?.sections ?? NO_SECTIONS, web, note };
}

export function compactPreviewOf(deps: CompactPreviewDeps, tab: ScopeId, pane: SessionKey, note: Text): CompactPreview {
    if (Array.from(collapsedText(note, 'remove')).length > NOTE_LIMIT) { return refused('note-too-long'); }
    const material = materialOf(deps, tab, pane, noteFromRequest(textOf(note)));
    if (material === null) { return refused('unknown-pane'); }
    return { kind: 'guidance', text: guidanceOf(material) };
}
