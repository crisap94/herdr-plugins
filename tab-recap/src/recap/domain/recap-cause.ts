export const RECAP_CAUSES = ['turn-ended', 'focused', 'requested'] as const;
export type RecapCause = typeof RECAP_CAUSES[number];
