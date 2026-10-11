import type { RefreshStatus } from '#src/recap/domain/freshness.ts';
import type { HandoffOutcome } from '#src/recap/domain/handoff-outcome.ts';
import type { HandoffId } from '#src/recap/domain/ids.ts';
import type { Fact, TaskId } from '#src/recap/domain/fact.ts';

export interface HandoffRenderInput {
    readonly handoff: HandoffId;
    readonly task: TaskId;
    readonly facts: readonly Fact[];
    readonly note: string | null;
    readonly refresh: RefreshStatus;
    readonly now: number;
}

export type RenderRefusal = Extract<HandoffOutcome, { readonly kind: 'refused'; readonly reason: 'ledger-empty' | 'content-empty' | 'too-large' }>;

export type HandoffRenderResult = { readonly kind: 'text'; readonly text: string } | RenderRefusal;

export type HandoffRender = (input: HandoffRenderInput) => HandoffRenderResult;
