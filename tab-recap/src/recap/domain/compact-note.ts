// `TAB_RECAP_COMPACT_NOTE`: whether `compact` opens the note popup first (`ask`, the default) or queues the compaction at once (`skip`, no popup, no note).
// `tab-recap compact --note "<text>"` queues at once with that note whatever the setting says.
export type CompactNote = 'ask' | 'skip';

export const COMPACT_NOTE_CHOICES: readonly CompactNote[] = ['ask', 'skip'];

export const compactNoteOf = (raw: string | undefined): CompactNote => (raw?.trim().toLowerCase() === 'skip' ? 'skip' : 'ask');
