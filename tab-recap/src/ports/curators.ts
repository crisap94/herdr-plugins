import type { Unknown } from './unknowable.ts';

export type Curated = { readonly kind: 'curated'; readonly text: string } | Unknown;

/** Reads one `curator_input` document and answers the curator's JSON. */
export interface Curators {
    /** which harness/model curates (logged) */
    readonly backend: string;
    write(document: string): Promise<Curated>;
}
