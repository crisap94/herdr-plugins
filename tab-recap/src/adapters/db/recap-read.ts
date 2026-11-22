import type { Database } from 'bun:sqlite';
import { and, asc, desc, eq, exists, gte, isNotNull, or, sql } from 'drizzle-orm';
import { renderRecap } from '#src/recap/application/recap-shape.ts';
import { sectionsOfOpen } from '#src/recap/domain/ledger-view.ts';
import { agentKind, paneId, type TabId } from '#src/recap/domain/ids.ts';
import { recapRunningOf } from '#src/ports/recap-records.ts';
import { cursorOf as positionOf, sourcePathOf } from '#src/ports/transcripts.ts';
import { usdOf } from '#src/recap/domain/usd.ts';
import type { RecapTask } from '#src/recap/domain/tasks.ts';
import { parseText, parseTextOrNull, type Text, textOf } from '#src/recap/domain/text.ts';
import { instant, type Instant } from '#src/recap/domain/time.ts';
import { must } from '#src/protocol/result.ts';
import type { LaneCursor, TabRecap } from '#src/ports/recap-records.ts';
import { chapter as chapters, lastGoodRun, run as runs, runTask as runTasks, runTaskLane as runTaskLanes, tab as tabs, task as tasks, transcript as transcripts } from './drizzle/index.ts';
import { ormOf, type Orm } from './orm.ts';
import { retiredFloor } from './retention.ts';
import { blob, flag, maybeText, text, whole } from './rows.ts';
import type { Row } from './rows.ts';
import { typeIdOf } from './typeid.ts';
import type { LedgerRows } from './ledger-rows.ts';
import { paneIdOf, type PaneId } from '@stateforge-labs/session-ledger/unstable/recap/domain/lane-shape.ts';

interface LatestRun {
    readonly run: Uint8Array | null;
    readonly at: Instant | null;
    readonly language: Text;
}

const cursorOf = (row: Row): LaneCursor => ({
    pane: paneId(text(row, 'pane')), agent: agentKind(text(row, 'agent')), transcript: sourcePathOf(text(row, 'source')), cursor: positionOf(whole(row, 'cursor')),
    tail: parseTextOrNull(maybeText(row, 'tail')), title: parseTextOrNull(maybeText(row, 'title')), lastPrompt: parseTextOrNull(maybeText(row, 'last_prompt')), claudeRecap: parseTextOrNull(maybeText(row, 'claude_note')),
});

export class RecapReader {
    private readonly orm: Orm;
    private readonly ledger: LedgerRows;

    constructor(db: Database, ledger: LedgerRows) {
        this.orm = ormOf(db);
        this.ledger = ledger;
    }

    private tasksOf(tab: TabId, run: Uint8Array, language: Text): readonly RecapTask[] {
        const laneRows = this.orm.select({ task_id: runTaskLanes.taskId, pane: transcripts.pane })
            .from(runTaskLanes).innerJoin(transcripts, eq(transcripts.id, runTaskLanes.transcriptId)).where(eq(runTaskLanes.runId, run))
            .orderBy(asc(runTaskLanes.taskId), asc(runTaskLanes.position)).all();
        const taskRows = this.orm.select({ task_id: runTasks.taskId, key: tasks.key, name: runTasks.name, legacy_markdown: runTasks.legacyMarkdown })
            .from(runTasks).innerJoin(tasks, eq(tasks.id, runTasks.taskId)).where(eq(runTasks.runId, run)).orderBy(asc(runTasks.position)).all();
        const lanes = new Map<string, PaneId[]>();
        for (const row of laneRows) {
            const task = typeIdOf('task', blob(row, 'task_id'));
            lanes.set(task, [...(lanes.get(task) ?? []), paneIdOf(text(row, 'pane'))]);
        }
        return taskRows.map((row) => {
            const legacy = maybeText(row, 'legacy_markdown');
            const key = text(row, 'key');
            const sections = legacy === null ? sectionsOfOpen(this.ledger.openOf({ tab, key: textOf(key) })) : null;
            return {
                id: textOf(key), name: textOf(maybeText(row, 'name') ?? ''), lanes: lanes.get(typeIdOf('task', blob(row, 'task_id'))) ?? [], sections,
                markdown: textOf(sections === null ? (legacy ?? '') : renderRecap(sections, language === 'es' ? 'es' : 'en')),
            };
        });
    }

    private facts(tab: TabId): LatestRun {
        const good = this.orm.select({ id: runs.id, at: runs.at, language: runs.language }).from(runs)
            .innerJoin(lastGoodRun, eq(lastGoodRun.runId, runs.id)).innerJoin(chapters, eq(chapters.id, runs.chapterId))
            .where(and(eq(lastGoodRun.tabId, tab), gte(chapters.n, retiredFloor(tab)))).get();
        if (good !== undefined) {
            return { run: blob(good, 'id'), at: instant(whole(good, 'at')), language: must(parseText(good.language)) };
        }
        const newest = this.orm.select({ language: runs.language }).from(runs)
            .innerJoin(chapters, eq(chapters.id, runs.chapterId)).where(eq(chapters.tabId, tab)).orderBy(desc(runs.id)).limit(1).get();
        return { run: null, at: null, language: must(parseText(newest?.language ?? 'en')) };
    }

    read(id: TabId): TabRecap | null {
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
            tab: id, lanes: lanes.map(cursorOf), tasks: facts.run === null ? [] : this.tasksOf(id, facts.run, facts.language), at: facts.at, running: recapRunningOf(flag(row, 'running')),
            backend: parseTextOrNull(maybeText(row, 'backend')), error: parseTextOrNull(maybeText(row, 'error')), costUsd: usdOf(whole(cost ?? {}, 'micro') / 1e6), language: facts.language,
        };
    }
}
