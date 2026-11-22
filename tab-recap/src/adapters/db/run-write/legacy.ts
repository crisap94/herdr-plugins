import type { Database } from 'bun:sqlite';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { RunFacts } from '#src/ports/recap-records.ts';
import type { GateStats } from '#src/recap/domain/gates/index.ts';
import type { TaskShape } from '#src/recap/domain/grouping.ts';
import { countOf, type Count } from '#src/recap/domain/count.ts';
import { paneId, tabId, type TabId } from '#src/recap/domain/ids.ts';
import { instant, type Instant } from '#src/recap/domain/time.ts';
import type { Usd } from '#src/recap/domain/usd.ts';
import { chapter as chapters, run as runs, runRead as reads, runTask as runTasks, runTaskLane as laneRows, task as tasks } from '../drizzle/index.ts';
import { ormOf, type Orm } from '../orm.ts';
import { blob } from '../rows.ts';
import { ids } from '../uuid7.ts';
import { RunInputRows, statsText } from '../run-inputs/legacy.ts';
import type { TranscriptMove, TranscriptStore } from '../transcripts.ts';

export const microsOf = (usd: Usd): Count => countOf(Math.round(usd * 1e6));

export interface StoredTask extends TaskShape {
    readonly legacy?: string;
}

interface PlacedTask {
    readonly task: StoredTask;
    readonly position: number;
}

export class RunRows {
    private readonly transcripts: TranscriptStore;
    private readonly inputs: RunInputRows;
    private readonly orm: Orm;

    constructor(db: Database, transcripts: TranscriptStore) {
        this.transcripts = transcripts;
        this.inputs = new RunInputRows(db);
        this.orm = ormOf(db);
    }

    private currentChapter(tab: TabId, at: Instant): Uint8Array {
        this.orm.insert(chapters).values({ id: ids.next(), tabId: tab, n: 1, startedAt: at }).onConflictDoNothing().run();
        const latest = this.orm.select({ id: chapters.id }).from(chapters).where(eq(chapters.tabId, tab)).orderBy(desc(chapters.n)).limit(1).get() ?? {};
        return blob(latest, 'id');
    }

    insertRun(facts: RunFacts, error: string | null, gateStats: GateStats | null = null): Uint8Array {
        const chapter = this.currentChapter(tabId(facts.tab), instant(facts.at));
        const id = ids.next();
        this.orm.insert(runs).values({
            id, chapterId: chapter, at: facts.at, cause: facts.cause, backend: facts.backend, language: facts.language,
            costMicroUsd: microsOf(facts.costUsd), error, gateStats: statsText(gateStats),
        }).run();
        return id;
    }

    insertInput(run: Uint8Array, document: string): void {
        this.inputs.put(run, document);
    }

    insertReads(run: Uint8Array, moved: readonly TranscriptMove[]): void {
        for (const read of moved) {
            this.orm.insert(reads).values({ runId: run, transcriptId: read.id, fromCursor: read.from, toCursor: read.to })
                .onConflictDoUpdate({ target: [reads.runId, reads.transcriptId], set: { fromCursor: sql`excluded.from_cursor`, toCursor: sql`excluded.to_cursor` } })
                .run();
        }
    }

    private writeTask(run: Uint8Array, facts: RunFacts, task: PlacedTask): void {
        this.orm.insert(tasks).values({ id: ids.next(), tabId: tabId(facts.tab), key: task.task.id }).onConflictDoNothing().run();
        const known = this.orm.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.tabId, tabId(facts.tab)), eq(tasks.key, task.task.id))).get() ?? {};
        const id = blob(known, 'id');
        this.orm.insert(runTasks).values({
            runId: run, taskId: id, position: task.position, name: task.task.name === '' ? null : task.task.name, legacyMarkdown: task.task.legacy ?? null,
        }).run();
        [...new Set(task.task.lanes)].forEach((pane, position) => {
            this.orm.insert(laneRows).values({ runId: run, taskId: id, transcriptId: this.transcripts.ofPane(tabId(facts.tab), paneId(pane), instant(facts.at)), position }).run();
        });
    }

    writeTasks(run: Uint8Array, facts: RunFacts, items: readonly StoredTask[]): void {
        items.forEach((task, position) => { this.writeTask(run, facts, { task, position }); });
    }
}
