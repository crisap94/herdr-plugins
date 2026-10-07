import type { Operation } from '#src/recap/domain/ops.ts';
import type { InputFact, RecapInput } from './recap-input.ts';
import type { Unknown } from './unknowable.ts';

/** An operation a gate refused, with the reasons, as the one retry quotes it (document ids, as the writer gave them). */
export interface RefusedOperation {
    /** the key of the task it was for */
    readonly task: string;
    readonly operation: Operation;
    readonly reasons: readonly { readonly gate: string; readonly reason: string }[];
}

/** The retry after refusals: only what was refused, what is wrong with the answer's shape, and the facts the refused operations name. */
export interface Correction {
    readonly refused: readonly RefusedOperation[];
    readonly problems: readonly string[];
    readonly facts: readonly InputFact[];
    /** whether the document has one ledger per task (an add then names its task) */
    readonly tasks: boolean;
}

export interface RecapRequest {
    readonly input: RecapInput;
    /** what the recap should be written in: `en`, `es` or free text such as `Português` */
    readonly language: string;
    /** what the previous recap is written in; different from `language` means: carry it over translated */
    readonly previousLanguage: string;
    /** set on the one retry: what was wrong with the first answer */
    readonly correction?: string;
    /** set on the one retry after refused operations: the writer is then given a `correction_input` and answers replacements only */
    readonly retry?: Correction;
}

export type Written = { readonly kind: 'written'; readonly text: string; readonly costUsd: number } | Unknown;

export interface Summarizer {
    /** which harness/model writes (shown in the recap's footer) */
    readonly backend: string;
    write(request: RecapRequest): Promise<Written>;
}
