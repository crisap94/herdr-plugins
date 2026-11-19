import type { Locale } from '#src/i18n/messages.ts';
import type { Extension, Note } from '#src/ports/extension.ts';
import type { TabLane } from '#src/ports/tab-views.ts';
import { notesByPaneOf, warningTextsOf } from './load.ts';

export function notesOf(extensions: readonly Extension[], lanes?: readonly TabLane[], locale?: Locale): ReadonlyMap<string, readonly Note[]> {
    return notesByPaneOf(extensions, lanes, locale);
}

export function warningsOf(extensions: readonly Extension[], locale: Locale): readonly string[] {
    return warningTextsOf(extensions, locale);
}
