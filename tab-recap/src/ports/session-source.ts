import type { Origin } from '#src/recap/domain/origin.ts';
/** What the store knows about one tab's session without a model's help: when it started, how many runs of each cause, the compactions. */
export interface SessionSource {
    /** when the tab was first seen (epoch ms); null when it is not known */
    firstSeen(tab: string): number | null;
    /** the writer's runs for the tab by cause (`turn-ended`, `focused`, `requested`, `imported`) */
    runsByCause(tab: string): Readonly<Record<string, number>>;
    /** the compactions of the tab that finished, oldest first; the tokens are null when the agent did not say; the origin says who started each */
    compactions(tab: string): readonly { readonly tokensBefore: number | null; readonly tokensAfter: number | null; readonly origin: Origin }[];
}
