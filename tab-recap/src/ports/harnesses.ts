import type { Unknown } from './unknowable.ts';

export type HarnessesResult = { readonly kind: 'available'; readonly ids: readonly string[] } | Unknown;

export interface Harnesses {
    available(): Promise<HarnessesResult>;
}
