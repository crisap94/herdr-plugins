import { must } from '#src/protocol/result.ts';
import type { NoteToken } from './coordination.ts';
import { parseText } from '@stateforge-labs/session-ledger/unstable/recap/domain/text.ts';
import type { Text } from '@stateforge-labs/session-ledger/unstable/recap/domain/text.ts';

export function notesKey(notes: readonly NoteToken[]): Text {
    return must(parseText(JSON.stringify(notes.map((note) => [note.label, note.value]))));
}
