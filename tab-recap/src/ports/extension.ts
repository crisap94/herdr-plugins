import type { Locale } from '#src/i18n/messages.ts';
import type { TabLane } from '#src/ports/tab-views.ts';
import type { Unknown } from './unknowable.ts';

export interface Note {
    readonly label: string;
    readonly at: number | null;
    readonly details: readonly string[];
    readonly mark?: string;
}

export type NotesResult = { readonly kind: 'notes'; readonly byPane: ReadonlyMap<string, readonly Note[]> } | Unknown;

export const DEFAULT_MARK = '⚑';

export interface Extension {
    readonly id: string;
    notes?(lanes?: readonly TabLane[], locale?: Locale): NotesResult;
    warning?(locale: Locale): string | null;
}
