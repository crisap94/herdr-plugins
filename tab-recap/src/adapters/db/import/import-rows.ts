import type { Database, Statement } from 'bun:sqlite';
import type { HiddenState } from '#src/recap/domain/board.ts';
import type { TabRecap } from '#src/ports/recap-records.ts';
import type { RecapTask } from '#src/recap/domain/tasks.ts';
import type { VisibilityAsk } from '#src/ports/requests.ts';
import type { LegacyViewFile } from '#src/ports/legacy-store-files.ts';
import { parseTabViewRecord } from '#src/ports/tab-views.ts';
import type { FactId } from '#src/recap/domain/fact.ts';
import { must } from '#src/protocol/result.ts';
import { parseFactId, parseRunId } from '#src/recap/domain/run-ids.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { instant, type Instant } from '#src/recap/domain/time.ts';
import { tabId } from '#src/recap/domain/ids.ts';
import { ColumnVisibilityRepository } from '../column-visibility.ts';
import { LedgerRows } from '../ledger-rows.ts';
import { RequestsStore } from '../requests.ts';
import { RunRows } from '../run-write.ts';
import { TabStore } from '../tab-row.ts';
import { TabViewRowStore } from '../tab-views.ts';
import { TranscriptStore } from '../transcripts.ts';
import { typeIdOf } from '../typeid.ts';
import { ids } from '../uuid7.ts';
import { opsOfSections } from './sections-to-ops.ts';
import { textOf } from '#src/recap/domain/text.ts';

export function attempt(db: Database, name: Text, work: () => void): Text | null {
    db.exec('SAVEPOINT piece');
    try {
        work();
        db.exec('RELEASE piece');
        return null;
    } catch (error) {
        db.exec('ROLLBACK TO piece');
        db.exec('RELEASE piece');
        const said = (error instanceof Error ? error.message : String(error)).replaceAll(/\s+/g, ' ');
        return must(parseText(`${name}: ${said.slice(0, 160)}`));
    }
}

const mint = (): FactId => must(parseFactId(typeIdOf('fact', ids.next())));

export class RowsWriter {
    private readonly db: Database;
    private readonly tabs: TabStore;
    private readonly transcripts: TranscriptStore;
    private readonly runs: RunRows;
    private readonly ledger: LedgerRows;
    private readonly views: TabViewRowStore;
    private readonly state: Statement;

    constructor(db: Database) {
        this.db = db;
        this.tabs = new TabStore(db);
        this.transcripts = new TranscriptStore(db);
        this.runs = new RunRows(db, this.transcripts);
        this.ledger = new LedgerRows(db);
        this.views = new TabViewRowStore(db);
        this.state = db.prepare('UPDATE tab SET running = ?, backend = ?, error = ? WHERE id = ?');
    }

    private tasks(run: Uint8Array, file: TabRecap, tasks: readonly RecapTask[]): void {
        const facts = { tab: file.tab, at: file.at ?? instant(0), cause: 'imported', backend: file.backend, language: file.language, costUsd: file.costUsd } as const;
        this.runs.writeTasks(run, facts, tasks.map((task) => ({ id: task.id, name: task.name, lanes: task.lanes, ...(task.sections === null ? { legacy: task.markdown } : {}) })));
        for (const task of tasks) {
            const ref = { id: must(parseRunId(typeIdOf('run', run))), task: { tab: file.tab, key: task.id }, at: facts.at, language: file.language, mint };
            this.ledger.applyTo(run, ref, task.sections === null ? [] : opsOfSections(task.sections));
        }
    }

    recap(file: TabRecap, now: Instant): void {
        const at = file.at ?? now;
        this.tabs.ensure(file.tab, instant(at));
        this.transcripts.attach(file.tab, file.lanes, instant(at));
        if (file.at !== null || file.error !== null || file.costUsd > 0) {
            const facts = { tab: file.tab, at, cause: 'imported', backend: file.backend, language: file.language, costUsd: file.costUsd } as const;
            const failed = file.at === null;
            const run = this.runs.insertRun(facts, failed ? (file.error ?? textOf('')) : null);
            this.tasks(run, file, failed ? [] : file.tasks);
        }
        this.state.run(file.running ? 1 : 0, file.backend, file.error, file.tab);
    }

    view(view: LegacyViewFile): void {
        this.views.writeTab(must(parseTabViewRecord(view)));
    }

    hidden(state: HiddenState): void {
        new ColumnVisibilityRepository(this.db).writeHidden(state);
    }

    requests(refresh: readonly Text[], visibility: readonly VisibilityAsk[], now: Instant): void {
        const queue = new RequestsStore(this.db, () => now);
        refresh.forEach((tab) => { queue.request(tabId(tab)); });
        visibility.forEach((asked) => { queue.requestVisibility(asked); });
    }
}
