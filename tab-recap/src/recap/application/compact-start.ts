import type { Done } from '#src/ports/columns.ts';
import type { CompactRequest } from '#src/ports/requests.ts';
import type { CompactNote } from '#src/recap/domain/compact-note.ts';
import { noteOf } from './compact-keys.ts';
import { NOTE_LIMIT } from './compaction-message.ts';

export interface CompactStart {
    askNote(tab: string, pane: string | null): Promise<Done>;
    queue(request: CompactRequest): Done;
}

export function requestNoteOf(text: string): string | null {
    const note = noteOf(text.replaceAll(/\p{Cc}/gu, (char) => (/\s/u.test(char) ? ' ' : '')));
    return note === null ? null : Array.from(note).slice(0, NOTE_LIMIT).join('').trimEnd();
}

export const opensPopup = (note: string | null | undefined, setting: CompactNote): boolean => note === undefined && setting === 'ask';

export async function startCompact(tab: string, pane: string | null, note: string | null | undefined, setting: CompactNote, start: CompactStart): Promise<Done> {
    if (opensPopup(note, setting)) {
        return start.askNote(tab, pane);
    }
    return start.queue({ tab, pane, note: note ?? null });
}
