import type { Applied } from './ledger.ts';
import type { CloseOp, UpdateOp } from '#src/recap/domain/ops.ts';
import type { TaskId } from '#src/recap/domain/fact.ts';

/** What the curator last wrote for a task: a paragraph and when its run began (epoch ms). */
export interface Story {
    readonly text: string;
    readonly at: number;
}

/** The curator's run: the task it looked at, when it began, and the language its facts are kept in. */
export interface CurationRun {
    readonly task: TaskId;
    readonly at: number;
    readonly language: string;
}

/** A task's story, read by the expanded view and kept by the curator. */
export interface Stories {
    read(tab: string, task: string): Story | null;
    /**
     * The merges go through the ledger and the story (when there is one) is kept, together or not at all; the story's time is `run.at`.
     * The facts' last run is the tab's newest one: the curator makes no run of its own.
     */
    keep(run: CurationRun, change: { readonly story: string | null; readonly merges: readonly CloseOp[]; readonly reconciled?: readonly (UpdateOp | CloseOp)[] }): Applied;
}
