import type { Operation } from '#src/recap/domain/ops.ts';
import type { InputFact, RecapInput } from './recap-input.ts';
import type { Unknown } from './unknowable.ts';
import type { JobContract } from '#src/recap/domain/backend.ts';

export interface RefusedOperation {
    readonly task: string;
    readonly operation: Operation;
    readonly reasons: readonly { readonly gate: string; readonly reason: string }[];
}

export interface Correction {
    readonly refused: readonly RefusedOperation[];
    readonly problems: readonly string[];
    readonly facts: readonly InputFact[];
    readonly tasks: boolean;
}

export interface RecapRequest {
    readonly input: RecapInput;
    readonly language: string;
    readonly previousLanguage: string;
    readonly correction?: string;
    readonly retry?: Correction;
}

export type Written = { readonly kind: 'written'; readonly text: string; readonly costUsd: number } | Unknown;

export interface Summarizer {
    readonly backend: string;
    readonly contract: JobContract;
    write(request: RecapRequest): Promise<Written>;
}
