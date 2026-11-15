import type { Origin } from '#src/recap/domain/origin.ts';
export interface CompactionTokens {
    readonly tokensBefore: number | null;
    readonly tokensAfter: number | null;
    readonly origin: Origin;
}

export interface SessionSource {
    firstSeen(tab: string): number | null;
    runsByCause(tab: string): Readonly<Record<string, number>>;
    compactions(tab: string): readonly CompactionTokens[];
}
