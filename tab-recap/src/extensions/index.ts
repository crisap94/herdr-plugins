import type { ExtensionFactory } from '#src/ports/extension.ts';
import { gitNote } from './git-note.ts';

export const FACTORIES: readonly ExtensionFactory[] = [
    gitNote,
];
