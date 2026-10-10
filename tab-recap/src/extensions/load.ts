import type { Locale } from '#src/i18n/messages.ts';
import type { TabLane } from '#src/ports/tab-views.ts';
import type { Extension, ExtensionFactory, Note } from '#src/ports/extension.ts';
import { isUnknown } from '#src/ports/unknowable.ts';
import { FACTORIES } from './index.ts';

export function loadExtensions(get: (key: string) => string | undefined, factories: readonly ExtensionFactory[] = FACTORIES): readonly Extension[] {
    return factories.flatMap((factory) => factory(get) ?? []);
}

export function notesOf(extensions: readonly Extension[], lanes?: readonly TabLane[], locale?: Locale): ReadonlyMap<string, readonly Note[]> {
    const merged = new Map<string, readonly Note[]>();
    for (const extension of extensions) {
        const result = extension.notes?.(lanes, locale);
        if (result === undefined || isUnknown(result)) {
            continue;
        }
        for (const [pane, notes] of result.byPane) {
            merged.set(pane, [...(merged.get(pane) ?? []), ...notes]);
        }
    }
    return merged;
}

export function warningsOf(extensions: readonly Extension[], locale: Locale): readonly string[] {
    return extensions.flatMap((extension) => extension.warning?.(locale) ?? []);
}
