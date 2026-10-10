import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { HiddenState } from '#src/recap/domain/board.ts';
import type { TabRecap } from '#src/ports/recap-records.ts';
import type { RecapTask } from '#src/recap/domain/tasks.ts';
import type { VisibilityRequest } from '#src/ports/requests.ts';
import type { TabView } from '#src/ports/tab-views.ts';
import type { FactId, RunId } from '#src/recap/domain/fact.ts';
import { ColumnVisibilityRepository } from '../column-visibility.ts';
import { LedgerRows } from '../ledger-rows.ts';
import { RequestsRepository } from '../requests.ts';
import { RunRows } from '../run-write.ts';
import { TabRow } from '../tab-row.ts';
import { TabViewsRepository } from '../tab-views.ts';
import { TranscriptRows } from '../transcripts.ts';
import { typeIdOf } from '../typeid.ts';
import { ids } from '../uuid7.ts';
import { opsOfSections } from './sections-to-ops.ts';

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

const mint = (): FactId => typeIdOf('fact', ids.next()) as FactId;

export class RowsWriter {
    private readonly db: DatabaseSync;
    private readonly tabs: TabRow;
    private readonly transcripts: TranscriptRows;
    private readonly runs: RunRows;
    private readonly ledger: LedgerRows;
    private readonly views: TabViewsRepository;
    private readonly state: StatementSync;

    constructor(db: DatabaseSync) {
        this.db = db;
        this.tabs = new TabRow(db);
        this.transcripts = new TranscriptRows(db);
        this.runs = new RunRows(db, this.transcripts);
        this.ledger = new LedgerRows(db);
        this.views = new TabViewsRepository(db, null);
        this.state = db.prepare('UPDATE tab SET running = ?, backend = ?, error = ? WHERE id = ?');
    }

    private tasks(run: Uint8Array, file: TabRecap, tasks: readonly RecapTask[]): void {
        const facts = { tab: file.tab, at: file.at ?? 0, cause: 'imported', backend: file.backend, language: file.language, costUsd: file.costUsd } as const;
        this.runs.writeTasks(run, facts, tasks.map((task) => ({ id: task.id, name: task.name, lanes: task.lanes, ...(task.sections === null ? { legacy: task.markdown } : {}) })));
        for (const task of tasks) {
            const ref = { id: typeIdOf('run', run) as RunId, task: { tab: file.tab, key: task.id }, at: facts.at, language: file.language, mint };
            this.ledger.applyTo(run, ref, task.sections === null ? [] : opsOfSections(task.sections));
        }
    }

    recap(file: TabRecap, now: number): void {
        const at = file.at ?? now;
        this.tabs.ensure(file.tab, at);
        this.transcripts.attach(file.tab, file.lanes, at);
        if (file.at !== null || file.error !== null || file.costUsd > 0) {
            const facts = { tab: file.tab, at, cause: 'imported', backend: file.backend, language: file.language, costUsd: file.costUsd } as const;
            const failed = file.at === null;
            const run = this.runs.insertRun(facts, failed ? (file.error ?? '') : null);
            this.tasks(run, file, failed ? [] : file.tasks);
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
