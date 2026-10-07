import type { Unknown } from './unknowable.ts';

export type Enumerated = { readonly kind: 'enumerated'; readonly text: string; readonly costUsd: number } | Unknown;

/** Reads one `enumerate_input` document and answers the candidates' JSON. */
export interface Enumerators {
    /** which harness/model enumerates (logged) */
    readonly backend: string;
    /** how it is set (harness · model · effort): what a report names */
    readonly job: string;
    write(document: string): Promise<Enumerated>;
}
