/** `timeout`: the lane did not settle in time. `status` is herdr's word (`idle` or `done`). */
export type Settled = { readonly kind: 'settled'; readonly status: string } | { readonly kind: 'timeout' };

/** Waiting for a lane to be free again after something was typed into it. */
export interface LaneSettling {
    /** Resolves with the first `idle`/`done` status of `pane` that came after `since` (epoch ms), or `timeout` after `timeoutMs`. */
    settled(pane: string, since: number, timeoutMs: number): Promise<Settled>;
}
