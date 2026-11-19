import type { Locale } from '#src/i18n/messages.ts';
import type { TabLane } from '#src/ports/tab-views.ts';
import type { Extension, Note } from '#src/ports/extension.ts';
import { isUnknown } from '#src/ports/unknowable.ts';
import { parsePaneId, type PaneId } from '#src/recap/domain/ids.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';

export { notesOf, warningsOf } from './legacy.ts';

export function notesByPaneOf(extensions: readonly Extension[], lanes?: readonly TabLane[], locale?: Locale): ReadonlyMap<PaneId, readonly Note[]> {
    const merged = new Map<PaneId, readonly Note[]>();
    for (const extension of extensions) {
        const result = extension.notes?.(lanes, locale);
        if (result === undefined || isUnknown(result)) {
            continue;
        }
        for (const [raw, notes] of result.byPane) {
            const pane = parsePaneId(raw);
            if (pane.kind === 'ok') {
                merged.set(pane.value, [...(merged.get(pane.value) ?? []), ...notes]);
            }
        }
    }
    return merged;
}

export function warningTextsOf(extensions: readonly Extension[], locale: Locale): readonly Text[] {
    return extensions.flatMap((extension) => {
        const warning = extension.warning?.(locale);
        if (warning === undefined || warning === null) {
            return [];
        }
        const text = parseText(warning);
        return text.kind === 'ok' ? [text.value] : [];
    });
}
