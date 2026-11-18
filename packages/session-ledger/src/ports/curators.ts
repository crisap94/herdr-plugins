import type { Unknown } from './unknowable.ts';

export type Curated = { readonly kind: 'curated'; readonly text: string } | Unknown;

export type CuratorMode = 'story' | 'reconcile';

export interface Curators {
    readonly backend: string;
    write(document: string, mode?: CuratorMode): Promise<Curated>;
}
