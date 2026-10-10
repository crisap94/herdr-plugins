// The compaction request from `tab-recap compact` and from `c` in a column: the note popup, or the request queued at once.
import type { Done } from '#src/ports/columns.ts';
import type { CompactRequest } from '#src/ports/requests.ts';
import type { CompactNote } from '#src/recap/domain/compact-note.ts';
import { noteOf } from './compact-keys.ts';
import { NOTE_LIMIT } from './compaction-message.ts';

export interface CompactStart {
    /** the note popup over everything, for this tab and pane (pane is null when none is known) */
    askNote(tab: string, pane: string | null): Promise<Done>;
    /** the request the popup sends, queued at once: the daemon does the rest */
    queue(request: CompactRequest): Done;
}

/** A `--note` text as the popup would send it: one line, trimmed, at most NOTE_LIMIT characters; nothing left is no note. */
export function requestNoteOf(text: string): string | null {
    const note = noteOf(text);
    return note === null ? null : Array.from(note).slice(0, NOTE_LIMIT).join('');
}

/**
 * Whether the request opens the note popup: only when no `--note` was given (`note` is undefined) and the setting is `ask`.
 * A note given on the command line never opens the popup, and `--note ""` (null) does not either.
 */
export const opensPopup = (note: string | null | undefined, setting: CompactNote): boolean => note === undefined && setting === 'ask';

/**
 * `note` is the `--note` text (null for `--note ""`), or undefined when no `--note` was given: then the setting decides,
 * `ask` opens the popup and `skip` queues with no note.
 */
export async function startCompact(tab: string, pane: string | null, note: string | null | undefined, setting: CompactNote, start: CompactStart): Promise<Done> {
    if (opensPopup(note, setting)) {
        return start.askNote(tab, pane);
    }
    return start.queue({ tab, pane, note: note ?? null });
}
