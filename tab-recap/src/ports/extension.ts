import type { Locale } from '#src/i18n/messages.ts';
import type { TabLane } from '#src/ports/tab-views.ts';
import type { Unknown } from './unknowable.ts';

/** One labelled line-group an extension attaches to a lane, shown under the lane's header. */
export interface Note {
    readonly label: string;
    readonly at: number | null;
    readonly details: readonly string[];
    /** the glyph before the label; the column draws `⚑` when absent */
    readonly mark?: string;
}

export type NotesResult = { readonly kind: 'notes'; readonly byPane: ReadonlyMap<string, readonly Note[]> } | Unknown;

export type UpkeepResult = { readonly kind: 'idle' } | { readonly kind: 'acted'; readonly saying: string } | Unknown;

/** The mark a note wears when it names none. */
export const DEFAULT_MARK = '⚑';

/** An optional add-on. Every member is optional: the plugin works with none loaded. */
export interface Extension {
    readonly id: string;
    notes?(lanes?: readonly TabLane[], locale?: Locale): NotesResult;
    warning?(locale: Locale): string | null;
    upkeep?(): Promise<UpkeepResult>;
}

/** Returns null when the extension does not apply; reads its configuration through `get`, at call time. */
export type ExtensionFactory = (get: (key: string) => string | undefined) => Extension | null;
