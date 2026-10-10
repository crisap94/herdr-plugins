import type { CheckedFact } from '#src/recap/domain/autocompact.ts';

export interface AutocompactBriefs {
    put(decisionId: string, brief: string, appended: readonly number[], checked: readonly CheckedFact[], briefedAt: number): void;
    clearBefore(cutoff: number): number;
}
