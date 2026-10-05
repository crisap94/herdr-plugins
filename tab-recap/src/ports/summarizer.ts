import type { Unknown } from './unknowable.ts';

/** What is known of one lane, so the writer can tell which lanes work on the same thing. */
export interface LaneHint {
    readonly pane: string;
    /** e.g. 'claude in w1:p1 — Victoria cutover' */
    readonly label: string;
    readonly cwd: string | null;
    /** the git repository's top-level directory, when the cwd is in one */
    readonly repo: string | null;
    readonly branch: string | null;
    /** files the lane edited in the excerpt (the most recent ones) */
    readonly files: readonly string[];
}

/** The grouping in force: which lanes are one task. */
export interface TaskGroup {
    readonly id: string;
    readonly name: string;
    readonly lanes: readonly string[];
}

export interface RecapRequest {
    readonly previous: string;
    readonly excerpt: string;
    /** what the recap should be written in: `en`, `es` or free text such as `Português` */
    readonly language: string;
    /** what the previous recap is written in; different from `language` means: carry it over translated */
    readonly previousLanguage: string;
    /** the agents whose transcripts the excerpt interleaves, e.g. 'claude in w1:p1 — Victoria cutover' */
    readonly lanes: readonly string[];
    /** one per lane; with two or more the writer also groups the lanes into tasks (omitted: it does not) */
    readonly hints?: readonly LaneHint[];
    /** the grouping the previous recap used; the writer keeps it unless the evidence says otherwise */
    readonly grouping?: readonly TaskGroup[];
    /** set on the one retry: what was wrong with the first answer */
    readonly correction?: string;
}

export type Written = { readonly kind: 'written'; readonly text: string; readonly costUsd: number } | Unknown;

export interface Summarizer {
    readonly backend: string;
    write(request: RecapRequest): Promise<Written>;
}
