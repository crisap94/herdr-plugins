import { uncheckedTypeId } from '#src/recap/domain/type-id.ts';
import { parseCompactionId, type CompactionId, type SessionKey, type ScopeId } from '#src/recap/domain/ids.ts';
import type { Database } from 'bun:sqlite';
import { and, eq, isNull, lt, sql } from 'drizzle-orm';
import { parseCompactionRow } from '#src/ports/compaction-records.ts';
import type { ActiveStage, CompactionActivity, CompactionFinish, CompactionLog, CompactionRow, CompactionStart, EndStage, StageNote } from '#src/ports/compaction-records.ts';
import { must } from '#src/protocol/result.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import { blob, guarded } from './rows.ts';
import type { Row } from './rows.ts';
import { writeTx } from './connection.ts';
import { compaction } from './drizzle/index.ts';
import { ormOf, type Orm } from './orm.ts';
import { idOf, typeIdOf } from './typeid.ts';
import { ids } from './uuid7.ts';

const ENDED: ReadonlySet<string> = new Set<EndStage>(['compacted', 'failed', 'unconfirmed', 'skipped']);
const AUTO_ORIGIN = 'auto';
const NOT_RETRIED = 0;
const NOT_QUEUED = 0;
const RETRIED = 1;
const ACTIVE: CompactionActivity = 'auto-in-progress';
const IDLE: CompactionActivity = 'idle';

export class CompactionLogRepository implements CompactionLog {
    private readonly db: Database;
    private readonly orm: Orm;

    constructor(db: Database) {
        this.db = db;
        this.orm = ormOf(db);
    }

    begin(start: CompactionStart): CompactionId {
        const id = ids.next();
        const finished = ENDED.has(start.stage) ? start.at : null;
        writeTx(this.db, () => {
            this.orm.insert(compaction).values({
                id, tabId: start.tab, pane: start.pane, agent: start.agent, stage: start.stage, writer: start.writer ?? null,
                startedAt: start.at, stageAt: start.at, finishedAt: finished, why: start.why ?? null, origin: start.origin ?? 'operator', answer: start.answer ?? null,
                retried: NOT_RETRIED, queued: NOT_QUEUED,
            }).run();
        });
        return must(parseCompactionId(typeIdOf('compaction', id)));
    }

    advance(id: CompactionId, stage: ActiveStage, facts: StageNote): void {
        const key = idOf('compaction', uncheckedTypeId(id));
        const queued = facts.queue === undefined ? null : Number(facts.queue === 'queued');
        if (key !== null) {
            writeTx(this.db, () => {
                this.orm.update(compaction).set({
                    stage, stageAt: facts.at,
                    brief: sql`COALESCE(${facts.brief ?? null}, ${compaction.brief})`,
                    writer: sql`COALESCE(${facts.writer ?? null}, ${compaction.writer})`,
                    templateWhy: sql`COALESCE(${facts.templateWhy ?? null}, ${compaction.templateWhy})`,
                    queued: sql`COALESCE(${queued}, ${compaction.queued})`,
                }).where(and(eq(compaction.id, key), isNull(compaction.finishedAt))).run();
            });
        }
    }

    finish(id: CompactionId, end: CompactionFinish): void {
        const key = idOf('compaction', uncheckedTypeId(id));
        if (key !== null) {
            writeTx(this.db, () => {
                this.orm.update(compaction).set({
                    stage: end.stage, stageAt: end.at, finishedAt: end.at, tokensBefore: end.tokensBefore ?? null, tokensAfter: end.tokensAfter ?? null,
                    tookMs: end.took ?? null, retried: end.retry === 'retried' ? RETRIED : NOT_RETRIED, why: end.why ?? null,
                }).where(and(eq(compaction.id, key), isNull(compaction.finishedAt))).run();
            });
        }
    }

    dismissTurn(tab: ScopeId, pane: SessionKey, at: Instant): void {
        writeTx(this.db, () => {
            this.orm.update(compaction).set({ dismissedAt: at })
                .where(and(eq(compaction.tabId, tab), eq(compaction.pane, pane), lt(compaction.finishedAt, at), isNull(compaction.dismissedAt)))
                .run();
        });
    }

    interrupted(at: Instant, why: Text): Count {
        return writeTx(this.db, () => must(parseCount(this.orm.update(compaction).set({ stage: 'unconfirmed', stageAt: at, finishedAt: at, why })
            .where(isNull(compaction.finishedAt)).returning({ id: compaction.id }).all().length)));
    }

    autoInProgress(): CompactionActivity {
        return guarded(() => (this.orm.select({ found: sql`1` }).from(compaction)
            .where(and(eq(compaction.origin, AUTO_ORIGIN), isNull(compaction.finishedAt))).limit(1).get() === undefined ? IDLE : ACTIVE), IDLE);
    }

    shownFor(tab: ScopeId): readonly CompactionRow[] {
        return guarded(() => this.orm.all<Row>(sql`SELECT id, tab_id AS tab, pane, agent, stage, brief, writer, template_why AS templateWhy, why, origin, retried, queued,
  started_at AS startedAt, stage_at AS stageAt, finished_at AS finishedAt, tokens_before AS tokensBefore, tokens_after AS tokensAfter, took_ms AS tookMs
  FROM compaction c WHERE tab_id = ${tab} AND dismissed_at IS NULL AND id = (
  SELECT id FROM compaction WHERE tab_id = c.tab_id AND pane = c.pane ORDER BY started_at DESC, id DESC LIMIT 1) ORDER BY started_at, id`).flatMap((row) => {
            const parsed = parseCompactionRow({ ...row, id: typeIdOf('compaction', blob(row, 'id')), retried: row['retried'] === 1, queued: row['queued'] === 1 });
            return parsed.kind === 'ok' ? [parsed.value] : [];
        }), []);
    }
}
