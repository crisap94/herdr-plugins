import type { Brand } from './brand.ts';
import type { Duration } from './time.ts';

export type Unsupported = { readonly kind: 'unsupported'; readonly why: string };

export function unsupported(why: string): Unsupported {
    return { kind: 'unsupported', why };
}

export type CompactionPiece = Brand<string, 'CompactionPiece'>;
export type ConfirmationReads = Brand<number, 'ConfirmationReads'>;

export function compactionPiece(text: string): CompactionPiece {
    return text as CompactionPiece;
}

export function confirmationReads(reads: number): ConfirmationReads {
    return reads as ConfirmationReads;
}

export interface CompactionLine {
    readonly pieces: readonly CompactionPiece[];
}

export function compactionLine(...pieces: readonly CompactionPiece[]): CompactionLine {
    return { pieces };
}

export type Confirmation =
    | { readonly kind: 'turn-end' }
    | { readonly kind: 'poll'; readonly reads: ConfirmationReads; readonly every: Duration };

export type FollowUp = { readonly kind: 'restore-message'; readonly acceptsStall: boolean } | { readonly kind: 'none' };

export interface CompactionPlan {
    readonly lines: readonly CompactionLine[];
    readonly enterDelay: Duration;
    readonly confirm: Confirmation;
    readonly retryOnSelfFailure: boolean;
    readonly followUp: FollowUp;
}

export type CompactionPlanFactory = (guidance: string) => CompactionPlanResult;

export type CompactionPlanResult = { readonly kind: 'supported'; readonly plan: CompactionPlan } | Unsupported;
