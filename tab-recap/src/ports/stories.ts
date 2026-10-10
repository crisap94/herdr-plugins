import type { Applied } from './ledger.ts';
import type { CloseOp, UpdateOp } from '#src/recap/domain/ops.ts';
import type { TaskId } from '#src/recap/domain/fact.ts';

export interface Story {
    readonly text: string;
    readonly at: number;
}

export interface CurationRun {
    readonly task: TaskId;
    readonly at: number;
    readonly language: string;
}

export interface Stories {
    read(tab: string, task: string): Story | null;
    keep(run: CurationRun, change: { readonly story: string | null; readonly merges: readonly CloseOp[]; readonly reconciled?: readonly (UpdateOp | CloseOp)[] }): Applied;
}
