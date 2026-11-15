import { originOf } from '#src/recap/domain/origin.ts';
import { paneId, tabId } from '#src/recap/domain/ids.ts';
import type { Database } from 'bun:sqlite';
import { and, eq, isNull, lt, sql } from 'drizzle-orm';
import type { ActiveStage, BeginCompaction, BriefOrigin, CompactionEnd, CompactionRecord, CompactionRecords, EndStage, Stage, StageFacts } from '#src/ports/compaction-records.ts';
import { BadRow, blob, flag, guarded, maybeText, maybeWhole, text, whole } from './rows.ts';
import type { Row } from './rows.ts';
import { writeTx } from './connection.ts';
import { compaction } from './drizzle/index.ts';
import { ormOf, type Orm } from './orm.ts';
import { idOf, typeIdOf } from './typeid.ts';
import { ids } from './uuid7.ts';

const STAGES: ReadonlySet<string> = new Set<Stage>(['briefing', 'compacting', 'restoring', 'compacted', 'failed', 'unconfirmed', 'skipped']);
const ENDED: ReadonlySet<string> = new Set<EndStage>(['compacted', 'failed', 'unconfirmed', 'skipped']);
const AUTO_ORIGIN = 'auto';
const NOT_RETRIED = 0;
const NOT_QUEUED = 0;
const RETRIED = 1;

function stageOf(row: Row): Stage {
    const word = text(row, 'stage');
    if (!STAGES.has(word)) {
        throw new BadRow('stage is not a stage');
    }
    return word as Stage;
}

function queuedOf(queued: boolean | undefined): number | null {
    if (queued === undefined) return null;
    return queued ? 1 : 0;
}

function briefOf(row: Row): BriefOrigin | null {
    const word = maybeText(row, 'brief');
    return word === 'written' || word === 'template' ? word : null;
}

function recordOf(row: Row): CompactionRecord {
    return {
        id: typeIdOf('compaction', blob(row, 'id')), tab: text(row, 'tab_id'), pane: text(row, 'pane'), agent: text(row, 'agent'),
        stage: stageOf(row), brief: briefOf(row), writer: maybeText(row, 'writer'), templateWhy: maybeText(row, 'template_why'),
        startedAt: whole(row, 'started_at'), stageAt: whole(row, 'stage_at'), finishedAt: maybeWhole(row, 'finished_at'),
        tokensBefore: maybeWhole(row, 'tokens_before'), tokensAfter: maybeWhole(row, 'tokens_after'), tookMs: maybeWhole(row, 'took_ms'),
        retried: flag(row, 'retried'), queued: flag(row, 'queued'), why: maybeText(row, 'why'), origin: originOf(text(row, 'origin')),
    };
}

export class CompactionRecordsRepository implements CompactionRecords {
    private readonly db: Database;
    private readonly orm: Orm;

    constructor(db: Database) {
        this.db = db;
        this.orm = ormOf(db);
    }

    begin(start: BeginCompaction): string {
        const id = ids.next();
        const finished = ENDED.has(start.stage) ? start.at : null;
        writeTx(this.db, () => {
            this.orm.insert(compaction).values({
                id, tabId: tabId(start.tab), pane: paneId(start.pane), agent: start.agent, stage: start.stage, writer: start.writer ?? null,
                startedAt: start.at, stageAt: start.at, finishedAt: finished, why: start.why ?? null, origin: start.origin ?? 'operator', answer: start.answer ?? null,
                retried: NOT_RETRIED, queued: NOT_QUEUED,
            }).run();
        });
        return typeIdOf('compaction', id);
    }

    advance(id: string, stage: ActiveStage, facts: StageFacts): void {
        const key = idOf('compaction', id);
        if (key !== null) {
            writeTx(this.db, () => {
                this.orm.update(compaction).set({
                    stage, stageAt: facts.at,
                    brief: sql`COALESCE(${facts.brief ?? null}, ${compaction.brief})`,
                    writer: sql`COALESCE(${facts.writer ?? null}, ${compaction.writer})`,
                    templateWhy: sql`COALESCE(${facts.templateWhy ?? null}, ${compaction.templateWhy})`,
                    queued: sql`COALESCE(${queuedOf(facts.queued)}, ${compaction.queued})`,
                }).where(and(eq(compaction.id, key), isNull(compaction.finishedAt))).run();
            });
        }
    }

    finish(id: string, end: CompactionEnd): void {
        const key = idOf('compaction', id);
        if (key !== null) {
            writeTx(this.db, () => {
                this.orm.update(compaction).set({
                    stage: end.stage, stageAt: end.at, finishedAt: end.at, tokensBefore: end.tokensBefore ?? null, tokensAfter: end.tokensAfter ?? null,
                    tookMs: end.tookMs ?? null, retried: end.retried === true ? RETRIED : NOT_RETRIED, why: end.why ?? null,
                }).where(and(eq(compaction.id, key), isNull(compaction.finishedAt))).run();
            });
        }
    }

    dismissTurn(tab: string, pane: string, at: number): void {
        writeTx(this.db, () => {
            this.orm.update(compaction).set({ dismissedAt: at })
                .where(and(eq(compaction.tabId, tabId(tab)), eq(compaction.pane, paneId(pane)), lt(compaction.finishedAt, at), isNull(compaction.dismissedAt)))
                .run();
        });
    }

    interrupted(at: number, why: string): number {
        return writeTx(this.db, () => this.orm.update(compaction).set({ stage: 'unconfirmed', stageAt: at, finishedAt: at, why })
            .where(isNull(compaction.finishedAt)).returning({ id: compaction.id }).all().length);
    }

    autoInProgress(): boolean {
        return guarded(() => this.orm.select({ found: sql`1` }).from(compaction)
            .where(and(eq(compaction.origin, AUTO_ORIGIN), isNull(compaction.finishedAt))).limit(1).get() !== undefined, false);
    }

    shownFor(tab: string): readonly CompactionRecord[] {
        return guarded(() => this.orm.all<Row>(sql`SELECT * FROM compaction c WHERE tab_id = ${tab} AND dismissed_at IS NULL AND id = (
  SELECT id FROM compaction WHERE tab_id = c.tab_id AND pane = c.pane ORDER BY started_at DESC, id DESC LIMIT 1) ORDER BY started_at, id`).map(recordOf), []);
    }
}
