import type { FailedRun, LastRun, RecapRecords, RecordedRun } from '#src/ports/recap-records.ts';

type Entry = LastRun & { readonly tab: string; readonly error: string | null };

export class MemoryRunHistory implements Pick<RecapRecords, 'recordRun' | 'failRun' | 'lastRunOf'> {
    private readonly runs: Entry[] = [];

    recordRun(run: RecordedRun): void {
        this.runs.push({ tab: run.tab, at: run.at, cause: run.cause, error: run.error });
    }

    failRun(run: FailedRun): void {
        this.runs.push({ tab: run.tab, at: run.at, cause: run.cause, error: run.error });
    }

    lastRunOf(tab: string): LastRun | null {
        const good = this.runs.filter((run) => run.tab === tab && run.error === null).at(-1);
        return good === undefined ? null : { at: good.at, cause: good.cause };
    }
}
