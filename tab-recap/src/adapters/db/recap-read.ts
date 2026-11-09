import type { Database } from 'bun:sqlite';
import { and, asc, desc, eq, exists, isNotNull, or, sql } from 'drizzle-orm';
import { renderRecap } from '#src/recap/application/recap-shape.ts';
import { sectionsOfOpen } from '#src/recap/domain/ledger-view.ts';
import { parseTabId } from '#src/recap/domain/ids.ts';
import type { TabId } from '#src/recap/domain/ids.ts';
import type { RecapTask } from '#src/recap/domain/tasks.ts';
import type { LaneCursor, TabRecap } from '#src/ports/recap-records.ts';
import { chapter as chapters, lastGoodRun, run as runs, runTask as runTasks, runTaskLane as runTaskLanes, tab as tabs, task as tasks, transcript as transcripts } from './drizzle/index.ts';
import { ormOf, type Orm } from './orm.ts';
import { blob, flag, maybeText, text, whole } from './rows.ts';
import type { Row } from './rows.ts';
import { typeIdOf } from './typeid.ts';
import type { LedgerRows } from './ledger-rows.ts';

const cursorOf = (row: Row): LaneCursor => ({
    pane: text(row, 'pane'), agent: text(row, 'agent'), transcript: text(row, 'source'), cursor: whole(row, 'cursor'),
    tail: maybeText(row, 'tail'), title: maybeText(row, 'title'), lastPrompt: maybeText(row, 'last_prompt'), claudeRecap: maybeText(row, 'claude_note'),
});

const groupBy = <T>(rows: readonly Row[], make: (row: Row) => T): Map<string, T[]> => {
    const groups = new Map<string, T[]>();
    for (const row of rows) {
        const task = typeIdOf('task', blob(row, 'task_id'));
        groups.set(task, [...(groups.get(task) ?? []), make(row)]);
    }
    return groups;
};

export class RecapReader {
    private readonly orm: Orm;
    private readonly ledger: LedgerRows;

    constructor(db: Database, ledger: LedgerRows) {
        this.orm = ormOf(db);
        this.ledger = ledger;
    }

    private tasksOf(tab: string, run: Uint8Array, language: string): readonly RecapTask[] {
        const laneRows = this.orm.select({ task_id: runTaskLanes.taskId, pane: transcripts.pane })
            .from(runTaskLanes).innerJoin(transcripts, eq(transcripts.id, runTaskLanes.transcriptId)).where(eq(runTaskLanes.runId, run))
            .orderBy(asc(runTaskLanes.taskId), asc(runTaskLanes.position)).all();
        const taskRows = this.orm.select({ task_id: runTasks.taskId, key: tasks.key, name: runTasks.name, legacy_markdown: runTasks.legacyMarkdown })
            .from(runTasks).innerJoin(tasks, eq(tasks.id, runTasks.taskId)).where(eq(runTasks.runId, run)).orderBy(asc(runTasks.position)).all();
        const lanes = groupBy(laneRows, (row) => text(row, 'pane'));
        return taskRows.map((row) => {
            const legacy = maybeText(row, 'legacy_markdown');
            const key = text(row, 'key');
            const sections = legacy === null ? sectionsOfOpen(this.ledger.openOf({ tab, key })) : null;
            return {
                id: key, name: maybeText(row, 'name') ?? '', lanes: lanes.get(typeIdOf('task', blob(row, 'task_id'))) ?? [], sections,
                markdown: sections === null ? (legacy ?? '') : renderRecap(sections, language === 'es' ? 'es' : 'en'),
            };
        });
    }

    private facts(tab: TabId): { readonly run: Uint8Array | null; readonly at: number | null; readonly language: string } {
        const good = this.orm.select({ id: runs.id, at: runs.at, language: runs.language }).from(runs)
            .innerJoin(lastGoodRun, eq(lastGoodRun.runId, runs.id)).where(eq(lastGoodRun.tabId, tab)).get();
        if (good !== undefined) {
            return { run: blob(good, 'id'), at: whole(good, 'at'), language: text(good, 'language') };
        }
        const newest = this.orm.select({ language: runs.language }).from(runs)
            .innerJoin(chapters, eq(chapters.id, runs.chapterId)).where(eq(chapters.tabId, tab)).orderBy(desc(runs.id)).limit(1).get();
        return { run: null, at: null, language: newest === undefined ? 'en' : text(newest, 'language') };
    }

    read(tab: string): TabRecap | null {
        const parsed = parseTabId(tab);
        if (parsed.kind === 'err') {
            return null;
        }
        const id = parsed.value;
        const orm = this.orm;
        const row = orm.select({ running: tabs.running, backend: tabs.backend, error: tabs.error }).from(tabs)
            .where(and(eq(tabs.id, id), or(eq(tabs.running, 1), isNotNull(tabs.error), isNotNull(tabs.backend),
                exists(orm.select({ one: sql`1` }).from(transcripts).where(eq(transcripts.tabId, tabs.id))),
                exists(orm.select({ one: sql`1` }).from(chapters).where(eq(chapters.tabId, tabs.id))))))
            .get();
        if (row === undefined) {
            return null;
        }
        const facts = this.facts(id);
        const lanes = orm.select({
            pane: transcripts.pane, agent: transcripts.agent, source: transcripts.source, cursor: transcripts.cursor, tail: transcripts.tail,
            title: transcripts.title, last_prompt: transcripts.lastPrompt, claude_note: transcripts.claudeNote,
        }).from(transcripts).where(and(eq(transcripts.tabId, id), eq(transcripts.attached, 1))).orderBy(asc(transcripts.position), asc(transcripts.id)).all();
        const cost = orm.select({ micro: sql<number>`coalesce(sum(${runs.costMicroUsd}), 0)` }).from(runs)
            .innerJoin(chapters, eq(chapters.id, runs.chapterId)).where(eq(chapters.tabId, id)).get();
        return {
            tab, lanes: lanes.map(cursorOf), tasks: facts.run === null ? [] : this.tasksOf(tab, facts.run, facts.language), at: facts.at, running: flag(row, 'running'),
            backend: maybeText(row, 'backend'), error: maybeText(row, 'error'), costUsd: whole(cost ?? {}, 'micro') / 1e6, language: facts.language,
        };
    }
}
