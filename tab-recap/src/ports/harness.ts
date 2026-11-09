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

export type CostBasis = 'billed' | 'list' | 'unreported' | 'unavailable';

export type ConfinementState = 'supported' | 'emulated' | 'unsupported' | 'unmeasured';

export interface ConfinementCell {
    readonly axis: 'builtins' | 'mcp' | 'settings';
    readonly state: ConfinementState;
}

export type Ran = { readonly kind: 'ran'; readonly text: string; readonly costUsd: number; readonly costBasis?: CostBasis; readonly confinement?: readonly ConfinementCell[] } | Unknown;

export interface Harness<Id extends string = string> {
    readonly id: Id;
    label(settings: HarnessSettings): string;
    readonly limit: number | null;
    run(call: HarnessCall, settings: HarnessSettings): Promise<Ran>;
}
