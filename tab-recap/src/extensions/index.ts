import { atalayaBridge } from './atalaya-bridge.ts';
import type { ExtensionFactory } from '#src/ports/extension.ts';
import { gitNote } from './git-note.ts';
import { tokenNotes } from './token-notes.ts';

export const FACTORIES: readonly ExtensionFactory[] = [
    atalayaBridge,
    gitNote,
    tokenNotes,
];
