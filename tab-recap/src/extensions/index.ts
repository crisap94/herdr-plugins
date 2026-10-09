import type { ExtensionFactory } from '#src/ports/extension.ts';
import { gitNote } from './git-note.ts';
import { tokenNotes } from './token-notes.ts';

export const FACTORIES: readonly ExtensionFactory[] = [
    gitNote,
    tokenNotes,
];
