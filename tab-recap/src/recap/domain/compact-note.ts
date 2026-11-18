export type CompactNote = 'ask' | 'skip';

export const COMPACT_NOTE_CHOICES: readonly CompactNote[] = ['ask', 'skip'];

export function parseCompactNote(raw: unknown): CompactNote {
    return typeof raw === 'string' && raw.trim().toLowerCase() === 'skip' ? 'skip' : 'ask';
}

export const compactNoteOf = parseCompactNote;
