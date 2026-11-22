import { noteFromRequest } from '#src/recap/application/compact-start.ts';
import { textOf, type Text } from '#src/recap/domain/text.ts';

export const requestNoteOf = (raw: string): Text | null => noteFromRequest(textOf(raw));
