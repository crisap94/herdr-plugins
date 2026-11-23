import type { JobContract } from '#src/recap/domain/backend.ts';
import type { Operation } from '#src/recap/domain/ops.ts';
import type { CloseEvidence } from '#src/recap/domain/pipeline.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Usd } from '#src/recap/domain/usd.ts';
import type { InputFact, RecapInput, Several } from './recap-input.ts';
import type { Unknown } from './unknowable.ts';

export interface GateReason { readonly gate: Text; readonly reason: Text; }

export interface RefusedOperation { readonly task: Text; readonly operation: Operation; readonly reasons: readonly GateReason[]; }

export interface Correction { readonly refused: readonly RefusedOperation[]; readonly problems: readonly Text[]; readonly facts: readonly InputFact[]; readonly tasks: Several; }

export interface RecapRequest { readonly input: RecapInput; readonly language: Text; readonly previousLanguage: Text; readonly notInLanguage?: readonly InputFact[]; readonly correction?: Text; readonly retry?: Correction; readonly closeEvidence?: CloseEvidence; }

export type Written = { readonly kind: 'written'; readonly text: Text; readonly costUsd: Usd } | Unknown;

export interface Summarizer {
    readonly backend: Text;
    readonly contract: JobContract;
    write(request: RecapRequest): Promise<Written>;
}
