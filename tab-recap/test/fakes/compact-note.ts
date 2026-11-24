import { noteFromRequest } from '#src/recap/application/compact-start.ts';
import { textOf, type Text } from '@stateforge-labs/session-ledger';

export const requestNoteOf = (raw: string): Text | null => noteFromRequest(textOf(raw));
