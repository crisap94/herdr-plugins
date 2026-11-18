import { err, must, ok, type Result } from '#src/protocol/result.ts';
import { brand, type Brand } from '@stateforge-labs/session-ledger/unstable/recap/domain/brand.ts';
import type { ParseFailure } from '@stateforge-labs/session-ledger/unstable/recap/domain/parse-failure.ts';
import type { Duration } from '@stateforge-labs/session-ledger/unstable/recap/domain/time.ts';

export type Unsupported = { readonly kind: 'unsupported'; readonly why: string };

export function unsupported(why: string): Unsupported {
    return { kind: 'unsupported', why };
}

export type CompactionPiece = Brand<string, 'CompactionPiece'>;
export type ConfirmationReads = Brand<number, 'ConfirmationReads'>;

export function parseCompactionPiece(input: unknown): Result<CompactionPiece, ParseFailure> {
    if (typeof input !== 'string') {
        return err({ kind: 'not-a-string' });
    }
    return ok(brand<string, 'CompactionPiece'>(input));
}

export function compactionPiece(text: string): CompactionPiece {
    return must(parseCompactionPiece(text));
}

export function parseConfirmationReads(input: unknown): Result<ConfirmationReads, ParseFailure> {
    if (typeof input !== 'number') {
        return err({ kind: 'not-a-number' });
    }
    return ok(brand<number, 'ConfirmationReads'>(input));
}

export function confirmationReads(reads: number): ConfirmationReads {
    return must(parseConfirmationReads(reads));
}

export type NeedsIdleReason = Brand<string, 'NeedsIdleReason'>;

export function parseNeedsIdleReason(input: unknown): Result<NeedsIdleReason, ParseFailure> {
    if (typeof input !== 'string') {
        return err({ kind: 'not-a-string' });
    }
    return ok(brand<string, 'NeedsIdleReason'>(input.trim()));
}

export class NotAReasonError extends Error {
    override readonly name = 'NotAReasonError';
}

export type WhileWorking = { readonly kind: 'queues' } | { readonly kind: 'needs-idle'; readonly reason: NeedsIdleReason };

export const QUEUES: WhileWorking = { kind: 'queues' };

export function needsIdle(reason: string): WhileWorking {
    if (reason.trim() === '') {
        throw new NotAReasonError('a kind that needs the lane idle must say why');
    }
    return { kind: 'needs-idle', reason: must(parseNeedsIdleReason(reason)) };
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
    readonly whileWorking: WhileWorking;
}

export type CompactionPlanFactory = (guidance: string) => CompactionPlanResult;

export type CompactionPlanResult = { readonly kind: 'supported'; readonly plan: CompactionPlan } | Unsupported;
