export const CLAIM_KINDS = ['compaction', 'handoff'] as const;
export type ClaimKind = (typeof CLAIM_KINDS)[number];
