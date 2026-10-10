export type CompactNote = 'ask' | 'skip';

export const COMPACT_NOTE_CHOICES: readonly CompactNote[] = ['ask', 'skip'];

export const compactNoteOf = (raw: string | undefined): CompactNote => (raw?.trim().toLowerCase() === 'skip' ? 'skip' : 'ask');
