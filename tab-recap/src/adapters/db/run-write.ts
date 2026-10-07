// What one run writes: the run, the cursors it read from and to, its tasks with their lanes and items.
import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { RunFacts } from '#src/ports/recap-records.ts';
import type { GateStats } from '#src/recap/domain/gates/index.ts';
import type { RecapTask } from '#src/recap/domain/tasks.ts';
import { blob, one } from './rows.ts';
import { ids } from './uuid7.ts';
import { RunInputRows, statsText } from './run-inputs.ts';
import { itemsOf } from './sections-rows.ts';
import type { Moved, TranscriptRows } from './transcripts.ts';

/** Money is stored as whole millionths of a dollar. */
export const microsOf = (usd: number): number => Math.round(usd * 1e6);

export class RunRows {
    private readonly transcripts: TranscriptRows;
    private readonly inputs: RunInputRows;
    private readonly chapterInsert: StatementSync;
    private readonly chapterSelect: StatementSync;
    private readonly runInsert: StatementSync;
    private readonly readInsert: StatementSync;
    private readonly taskInsert: StatementSync;
    private readonly taskSelect: StatementSync;
    private readonly runTaskInsert: StatementSync;
    private readonly laneInsert: StatementSync;
    private readonly itemInsert: StatementSync;

    constructor(db: DatabaseSync, transcripts: TranscriptRows) {
        this.transcripts = transcripts;
        this.inputs = new RunInputRows(db);
        this.chapterInsert = db.prepare('INSERT OR IGNORE INTO chapter (id, tab_id, n, started_at) VALUES (?, ?, 1, ?)');
        this.chapterSelect = db.prepare('SELECT id FROM chapter WHERE tab_id = ? AND n = 1');
        this.runInsert = db.prepare('INSERT INTO run (id, chapter_id, at, cause, backend, language, cost_micro_usd, error, gate_stats) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
        this.readInsert = db.prepare('INSERT OR REPLACE INTO run_read (run_id, transcript_id, from_cursor, to_cursor) VALUES (?, ?, ?, ?)');
        this.taskInsert = db.prepare('INSERT OR IGNORE INTO task (id, tab_id, key) VALUES (?, ?, ?)');
        this.taskSelect = db.prepare('SELECT id FROM task WHERE tab_id = ? AND key = ?');
        this.runTaskInsert = db.prepare('INSERT INTO run_task (run_id, task_id, position, name, legacy_markdown) VALUES (?, ?, ?, ?, ?)');
        this.laneInsert = db.prepare('INSERT INTO run_task_lane (run_id, task_id, transcript_id, position) VALUES (?, ?, ?, ?)');
        this.itemInsert = db.prepare("INSERT INTO item (run_id, task_id, view, section, position, text) VALUES (?, ?, 'recap', ?, ?, ?)");
    }

    /** Until 1.7.0 a tab has one chapter. */
    private firstChapter(tab: string, at: number): Uint8Array {
        this.chapterInsert.run(ids.next(), tab, at);
        return blob(one(this.chapterSelect, tab) ?? {}, 'id');
    }

    insertRun(facts: RunFacts, error: string | null, gateStats: GateStats | null = null): Uint8Array {
        const chapter = this.firstChapter(facts.tab, facts.at);
        const id = ids.next();
        this.runInsert.run(id, chapter, facts.at, facts.cause, facts.backend, facts.language, microsOf(facts.costUsd), error, statsText(gateStats));
        return id;
    }

    /** The document the writer was given, kept with the run (inside the run's transaction). */
    insertInput(run: Uint8Array, document: string): void {
        this.inputs.put(run, document);
    }

    insertReads(run: Uint8Array, moved: readonly Moved[]): void {
        for (const read of moved) {
            this.readInsert.run(run, read.id, read.from, read.to);
        }
    }

    private writeTask(run: Uint8Array, facts: RunFacts, task: { readonly task: RecapTask; readonly position: number }): void {
        this.taskInsert.run(ids.next(), facts.tab, task.task.id);
        const id = blob(one(this.taskSelect, facts.tab, task.task.id) ?? {}, 'id');
        const legacy = task.task.sections === null ? task.task.markdown : null;
        this.runTaskInsert.run(run, id, task.position, task.task.name === '' ? null : task.task.name, legacy);
        [...new Set(task.task.lanes)].forEach((pane, position) => {
            this.laneInsert.run(run, id, this.transcripts.ofPane(facts.tab, pane, facts.at), position);
        });
        for (const item of task.task.sections === null ? [] : itemsOf(task.task.sections)) {
            this.itemInsert.run(run, id, item.section, item.position, item.text);
        }
    }

    writeTasks(run: Uint8Array, facts: RunFacts, tasks: readonly RecapTask[]): void {
        tasks.forEach((task, position) => { this.writeTask(run, facts, { task, position }); });
    }
}
