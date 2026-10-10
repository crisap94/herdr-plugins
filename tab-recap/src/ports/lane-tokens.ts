import type { Done } from './columns.ts';

export interface LaneTokens {
    report(pane: string, tokens: Readonly<Record<string, string | null>>, ttlMs: number): Promise<Done>;
}
