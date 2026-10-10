export type Settled = { readonly kind: 'settled'; readonly status: string } | { readonly kind: 'timeout' };

export interface LaneSettling {
    settled(pane: string, since: number, timeoutMs: number): Promise<Settled>;
}
