import type { Unknown } from './unknowable.ts';

export type Enumerated = { readonly kind: 'enumerated'; readonly text: string; readonly costUsd: number } | Unknown;

export interface Enumerators {
    readonly backend: string;
    readonly job: string;
    write(document: string): Promise<Enumerated>;
}
