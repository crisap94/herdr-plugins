// The legacy files, written as rows. Each piece runs in a savepoint: one that the schema refuses (a list over its cap, say)
// is reported by name instead of stopping the others from being looked at.
import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { HiddenState } from '#src/recap/domain/board.ts';
import type { TabRecap } from '#src/ports/recap-records.ts';
import type { VisibilityRequest } from '#src/ports/requests.ts';
import type { TabView } from '#src/ports/tab-views.ts';
import { ColumnVisibilityRepository } from '../column-visibility.ts';
import { RequestsRepository } from '../requests.ts';
import { RunRows } from '../run-write.ts';
import { TabRow } from '../tab-row.ts';
import { TabViewsRepository } from '../tab-views.ts';
import { TranscriptRows } from '../transcripts.ts';

/** `work`'s writes stay, or none of them do; the answer is the message when the schema refused. */
export function attempt(db: DatabaseSync, name: string, work: () => void): string | null {
    db.exec('SAVEPOINT piece');
    try {
        work();
        db.exec('RELEASE piece');
        return null;
    } catch (error) {
        db.exec('ROLLBACK TO piece');
        db.exec('RELEASE piece');
        const said = (error instanceof Error ? error.message : String(error)).replaceAll(/\s+/g, ' ');
        return `${name}: ${said.slice(0, 160)}`;
    }
}

export class RowsWriter {
    private readonly db: DatabaseSync;
    private readonly tabs: TabRow;
    private readonly transcripts: TranscriptRows;
    private readonly runs: RunRows;
    private readonly views: TabViewsRepository;
    private readonly state: StatementSync;

    constructor(db: DatabaseSync) {
        this.db = db;
        this.tabs = new TabRow(db);
        this.transcripts = new TranscriptRows(db);
        this.runs = new RunRows(db, this.transcripts);
        this.views = new TabViewsRepository(db, null);
        this.state = db.prepare('UPDATE tab SET running = ?, backend = ?, error = ? WHERE id = ?');
    }

    /** One run (cause `imported`) holds what the file's last good write said; a recap that never succeeded keeps its error, cost and writer in a failed one. */
    recap(file: TabRecap, now: number): void {
        const at = file.at ?? now;
        this.tabs.ensure(file.tab, at);
        this.transcripts.attach(file.tab, file.lanes, at);
        if (file.at !== null || file.error !== null || file.costUsd > 0) {
            const facts = { tab: file.tab, at, cause: 'imported', backend: file.backend, language: file.language, costUsd: file.costUsd } as const;
            const run = this.runs.insertRun(facts, file.at === null ? (file.error ?? '') : null);
            this.runs.writeTasks(run, facts, file.at === null ? [] : file.tasks);
        }
        this.state.run(file.running ? 1 : 0, file.backend, file.error, file.tab);
    }

    view(view: TabView): void {
        this.views.writeTab(view);
    }

    hidden(state: HiddenState): void {
        new ColumnVisibilityRepository(this.db).writeHidden(state);
    }

    requests(refresh: readonly string[], visibility: readonly VisibilityRequest[], now: number): void {
        const queue = new RequestsRepository(this.db, () => now);
        refresh.forEach((tab) => { queue.request(tab); });
        visibility.forEach((asked) => { queue.requestVisibility(asked); });
    }
}
