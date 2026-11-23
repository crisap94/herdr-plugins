import type { Locale } from '#src/i18n/messages.ts';
import type { TabLaneRecord } from '#src/ports/tab-views.ts';
import type { ExtensionPort, PaneNote } from '#src/ports/extension.ts';
import { isUnknown } from '#src/ports/unknowable.ts';
import { parsePaneId, type PaneId } from '#src/recap/domain/ids.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';

export function notesByPaneOf(extensions: readonly ExtensionPort[], lanes?: readonly TabLaneRecord[], locale?: Locale): ReadonlyMap<PaneId, readonly PaneNote[]> {
    const merged = new Map<PaneId, readonly PaneNote[]>();
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

export function warningTextsOf(extensions: readonly ExtensionPort[], locale: Locale): readonly Text[] {
    return extensions.flatMap((extension) => {
        const warning = extension.warning?.(locale);
        if (warning === undefined || warning === null) {
            return [];
        }
        const text = parseText(warning);
        return text.kind === 'ok' ? [text.value] : [];
    });
}
