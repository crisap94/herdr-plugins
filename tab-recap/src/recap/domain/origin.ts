// Who started a compaction or asked for one: the operator (the default), autocompact, or another tool through a `compact-req-<tool>` token.
export type Origin = 'operator' | 'auto' | 'request';

/** What the store keeps as a word, read back: anything unknown is the operator's. */
export const originOf = (raw: string | null | undefined): Origin => (raw === 'auto' || raw === 'request' ? raw : 'operator');
