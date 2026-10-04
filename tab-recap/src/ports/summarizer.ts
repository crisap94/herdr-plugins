import type { Unknown } from './unknowable.ts';

export interface RecapRequest {
    readonly previous: string;
    readonly excerpt: string;
    readonly words: number;
    /** what the recap should be written in: `en`, `es` or free text such as `Português` */
    readonly language: string;
    /** what the previous recap is written in; different from `language` means: carry it over translated */
    readonly previousLanguage: string;
    /** the agents whose transcripts the excerpt interleaves, e.g. 'claude in w1:p1 — Victoria cutover' */
    readonly lanes: readonly string[];
}

export type Written = { readonly kind: 'written'; readonly markdown: string; readonly costUsd: number } | Unknown;

export interface Summarizer {
    readonly backend: string;
    write(request: RecapRequest): Promise<Written>;
}
