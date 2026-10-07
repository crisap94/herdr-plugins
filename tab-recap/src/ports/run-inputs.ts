import type { GateStats } from '#src/recap/domain/gates/index.ts';

/** A run that wrote a recap, as the eval lists it. `id` is its TypeID (`run_…`). */
export interface StoredRun {
    readonly id: string;
    readonly tab: string;
    /** epoch ms */
    readonly at: number;
    readonly language: string;
    readonly backend: string | null;
    /** whether the document the writer was given is still kept */
    readonly hasInput: boolean;
    /** null for a run from before the gates */
    readonly gateStats: GateStats | null;
}

/** One item the run wrote, with the key a verdict names it by: `<task>/<section>/<position>`. */
export interface RunItem {
    readonly key: string;
    readonly section: string;
    readonly text: string;
}

export interface RunQuery {
    readonly tab: string | null;
    /** only runs at or after this time (epoch ms) */
    readonly since: number | null;
    readonly limit: number;
    /** only runs whose input is still kept */
    readonly withInput: boolean;
}

/** What the plugin keeps to judge a recap by: the document each run was given, and the run's items and gate counts. */
export interface RunInputs {
    /** newest first; runs that wrote items */
    runs(query: RunQuery): readonly StoredRun[];
    /** the `recap_input` document of the run, inflated; null when it was never kept or is deleted */
    document(run: string): string | null;
    itemsOf(run: string): readonly RunItem[];
    /** the gate counts of every run since `since` (epoch ms), newest first */
    gateCounts(since: number | null): readonly { readonly at: number; readonly stats: GateStats }[];
    /** delete the inputs of runs older than `before` (epoch ms); the runs stay; how many went */
    prune(before: number): number;
}
