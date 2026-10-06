import type { RecapInput } from './recap-input.ts';
import type { Unknown } from './unknowable.ts';

export interface RecapRequest {
    readonly input: RecapInput;
    /** what the recap should be written in: `en`, `es` or free text such as `Português` */
    readonly language: string;
    /** what the previous recap is written in; different from `language` means: carry it over translated */
    readonly previousLanguage: string;
    /** set on the one retry: what was wrong with the first answer */
    readonly correction?: string;
}

export type Written = { readonly kind: 'written'; readonly text: string; readonly costUsd: number } | Unknown;

export interface Summarizer {
    /** which harness/model writes (shown in the recap's footer) */
    readonly backend: string;
    write(request: RecapRequest): Promise<Written>;
}
