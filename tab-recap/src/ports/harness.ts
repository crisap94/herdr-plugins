import type { Effort } from '#src/recap/domain/effort.ts';
import type { Unknown } from './unknowable.ts';

export interface HarnessCall {
    readonly instructions: string;
    readonly input: string;
}

export interface HarnessSettings {
    readonly model: string;
    readonly effort: Effort;
}

export type Ran = { readonly kind: 'ran'; readonly text: string; readonly costUsd: number } | Unknown;

export interface Harness {
    readonly id: string;
    label(settings: HarnessSettings): string;
    readonly limit: number | null;
    run(call: HarnessCall, settings: HarnessSettings): Promise<Ran>;
}
