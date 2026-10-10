import type { Applied } from '#src/ports/ledger.ts';
import type { CurationRun, Stories, Story } from '#src/ports/stories.ts';
import type { FactId, RunId } from '#src/recap/domain/fact.ts';
import type { CloseOp, UpdateOp } from '#src/recap/domain/ops.ts';
import type { MemoryLedger } from './memory-ledger.ts';

export class MemoryStories implements Stories {
    private readonly ledger: MemoryLedger;
    private readonly told = new Map<string, Story>();

    constructor(ledger: MemoryLedger) {
        this.ledger = ledger;
    }

    read(tab: string, task: string): Story | null {
        return this.told.get(`${tab}\u0000${task}`) ?? null;
    }

    keep(run: CurationRun, change: { readonly story: string | null; readonly merges: readonly CloseOp[]; readonly reconciled?: readonly (UpdateOp | CloseOp)[] }): Applied {
        const applied = this.ledger.apply({ id: 'run_test' as RunId, task: run.task, at: run.at, language: run.language, mint: (): FactId => 'fct_none' as FactId }, [...change.merges, ...(change.reconciled ?? [])]);
        if (change.story !== null) {
            this.told.set(`${run.task.tab}\u0000${run.task.key}`, { text: change.story, at: run.at });
        }
        return applied;
    }
}
