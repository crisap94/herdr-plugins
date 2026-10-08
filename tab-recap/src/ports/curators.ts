import type { Unknown } from './unknowable.ts';

export type Curated = { readonly kind: 'curated'; readonly text: string } | Unknown;

/** What the curator is asked: `story` merges duplicates and writes the paragraph; `reconcile` checks the open facts against the newest turns. */
export type CuratorMode = 'story' | 'reconcile';

/** Reads one `curator_input` document and answers the curator's JSON. */
export interface Curators {
    /** which harness/model curates (logged) */
    readonly backend: string;
    write(document: string, mode?: CuratorMode): Promise<Curated>;
}
