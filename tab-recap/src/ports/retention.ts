export interface Removed {
    readonly runs: number;
    readonly chapters: number;
    readonly boundaries: number;
    readonly compactions: number;
    readonly facts: number;
}

export interface Retention {
    expired(cutoff: number): readonly string[];
    remove(tab: string): Removed;
}
