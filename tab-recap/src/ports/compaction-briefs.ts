import type { Unknown } from './unknowable.ts';

export type Briefed = { readonly kind: 'briefed'; readonly text: string } | Unknown;

export interface CompactionBriefs {
    readonly backend: string;
    readonly job: string;
    write(document: string, correction?: string): Promise<Briefed>;
}
