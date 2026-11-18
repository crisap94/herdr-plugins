import { err, ok, type Result } from '#src/protocol/result.ts';
import { brand, type Brand } from '@stateforge-labs/session-ledger/unstable/recap/domain/brand.ts';
import type { ParseFailure } from '@stateforge-labs/session-ledger/unstable/recap/domain/parse-failure.ts';
import type { Duration } from '@stateforge-labs/session-ledger/unstable/recap/domain/time.ts';
import type { CompactionPlan, Unsupported } from './legacy.ts';

export type CompactionPiece = Brand<string, 'CompactionPiece'>;
export type ConfirmationReads = Brand<number, 'ConfirmationReads'>;

export function parseCompactionPiece(input: unknown): Result<CompactionPiece, ParseFailure> {
    if (typeof input !== 'string') {
        return err({ kind: 'not-a-string' });
    }
    return ok(brand<string, 'CompactionPiece'>(input));
}

export function parseConfirmationReads(input: unknown): Result<ConfirmationReads, ParseFailure> {
    if (typeof input !== 'number') {
        return err({ kind: 'not-a-number' });
    }
    return ok(brand<number, 'ConfirmationReads'>(input));
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

export interface CompactionLine {
    readonly pieces: readonly CompactionPiece[];
}

export function compactionLine(...pieces: readonly CompactionPiece[]): CompactionLine {
    return { pieces };
}

export type Confirmation =
    | { readonly kind: 'turn-end' }
    | { readonly kind: 'poll'; readonly reads: ConfirmationReads; readonly every: Duration };

export type CompactionPlanResult = { readonly kind: 'supported'; readonly plan: CompactionPlan } | Unsupported;

export type { CompactionPlan, CompactionPlanFactory, FollowUp, Unsupported } from './legacy.ts';
export { compactionPiece, confirmationReads, needsIdle, unsupported } from './legacy.ts';
