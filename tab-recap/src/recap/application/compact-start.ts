import type { Done } from '#src/ports/columns.ts';
import type { CompactAsk } from '#src/ports/requests.ts';
import type { CompactNote } from '#src/recap/domain/compact-note.ts';
import type { PaneId, TabId } from '#src/recap/domain/ids.ts';
import type { Presence } from '#src/recap/domain/presence.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { collapsedText } from '#src/recap/domain/text-collapse.ts';
import { NOTE_LIMIT } from './compaction-message.ts';

export interface CompactStart {
    askNote(tab: TabId, pane: PaneId | null): Promise<Done>;
    queue(request: CompactAsk): Done;
}

export function noteFromRequest(raw: Text): Text | null {
    const note = collapsedText(raw, 'remove');
    if (note === '') {
        return null;
    }
    const parsed = parseText(Array.from(note).slice(0, NOTE_LIMIT).join('').trimEnd());
    return parsed.kind === 'ok' ? parsed.value : null;
}

export const opensAskPopup = (note: Text | null | undefined, setting: CompactNote): Presence => (note === undefined && setting === 'ask' ? 'present' : 'absent');

export async function beginCompact(tab: TabId, pane: PaneId | null, note: Text | null | undefined, setting: CompactNote, start: CompactStart): Promise<Done> {
    if (opensAskPopup(note, setting) === 'present') {
        return start.askNote(tab, pane);
    }
    return start.queue({ tab, pane, note: note ?? null });
}
