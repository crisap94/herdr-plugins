import type { Locale } from '#src/i18n/messages.ts';
import type { Extension, ExtensionFactory, Note } from '#src/ports/extension.ts';
import { isUnknown } from '#src/ports/unknowable.ts';
import { FACTORIES } from './index.ts';

/** The registry by default; a caller (a test) may pass its own list. */
export function loadExtensions(get: (key: string) => string | undefined, factories: readonly ExtensionFactory[] = FACTORIES): readonly Extension[] {
    return factories.flatMap((factory) => factory(get) ?? []);
}

/** Every extension's notes, merged per pane in factory order; a failing extension adds none. */
export function notesOf(extensions: readonly Extension[]): ReadonlyMap<string, readonly Note[]> {
    const merged = new Map<string, readonly Note[]>();
    for (const extension of extensions) {
        const result = extension.notes?.();
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
