import { must } from '@stateforge-labs/session-ledger';
import type { NoteToken } from './coordination.ts';
import { parseText } from '@stateforge-labs/session-ledger';
import type { Text } from '@stateforge-labs/session-ledger';

export function notesKey(notes: readonly NoteToken[]): Text {
    return must(parseText(JSON.stringify(notes.map((note) => [note.label, note.value]))));
}
