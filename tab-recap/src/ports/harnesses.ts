import type { Unknown } from './unknowable.ts';

export type HarnessesResult = { readonly kind: 'available'; readonly ids: readonly string[] } | Unknown;

/** Which coding-agent harnesses can be run here, by herdr's integration id (`claude`, `codex`, …). */
export interface Harnesses {
    available(): Promise<HarnessesResult>;
}
