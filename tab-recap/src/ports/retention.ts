/** What removing one tab took with it. */
export interface Removed {
    readonly runs: number;
    readonly chapters: number;
    readonly boundaries: number;
    readonly compactions: number;
    /** 0 until the ledger exists */
    readonly facts: number;
}

/** The store's side of retention. */
export interface Retention {
    /** The tabs last seen before `cutoff` (epoch ms) that have no column open. */
    expired(cutoff: number): readonly string[];
    /** Everything that belongs to the tab, in one transaction; what was removed. */
    remove(tab: string): Removed;
}
