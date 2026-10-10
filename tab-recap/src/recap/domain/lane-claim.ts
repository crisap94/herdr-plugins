export const CLAIM_KINDS = ['compaction', 'handoff'] as const;
export type ClaimKind = (typeof CLAIM_KINDS)[number];

export const isClaimKind = (value: unknown): value is ClaimKind => CLAIM_KINDS.some((kind) => kind === value);
