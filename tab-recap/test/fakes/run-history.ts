import type { FailedRun, LastRun, RecordedRun } from '@stateforge-labs/session-ledger';
import type { LegacyRecords as Records } from '@stateforge-labs/session-ledger';

type Entry = LastRun & { readonly tab: string; readonly error: string | null };

export class MemoryRunHistory implements Pick<Records, 'recordRun' | 'failRun' | 'lastRunOf'> {
    private readonly runs: Entry[] = [];

    recordRun(run: RecordedRun): void {
        this.runs.push({ tab: run.scope, at: run.at, cause: run.cause, error: run.error });
    }

    failRun(run: FailedRun): void {
        this.runs.push({ tab: run.scope, at: run.at, cause: run.cause, error: run.error });
    }

    lastRunOf(tab: string): LastRun | null {
        const good = this.runs.findLast((run) => run.tab === tab && run.error === null);
        return good === undefined ? null : { at: good.at, cause: good.cause };
    }
}
