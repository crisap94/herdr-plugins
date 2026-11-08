import { blob, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { RowId } from './columns.ts';
import type { PaneId, TabId } from '#src/recap/domain/ids.ts';
import type { BriefOrigin, Stage } from '#src/ports/compaction-records.ts';
import { BLOB_MODE } from './constants.ts';

export const compaction = sqliteTable('compaction', {
    id: blob('id', { mode: BLOB_MODE }).$type<RowId<'compaction'>>().primaryKey().notNull(),
    tabId: text('tab_id').$type<TabId>().notNull(),
    pane: text('pane').$type<PaneId>().notNull(),
    agent: text('agent').notNull(),
    stage: text('stage').$type<Stage>().notNull(),
    brief: text('brief').$type<BriefOrigin>(),
    writer: text('writer'),
    templateWhy: text('template_why'),
    startedAt: integer('started_at').notNull(),
    stageAt: integer('stage_at').notNull(),
    finishedAt: integer('finished_at'),
    tokensBefore: integer('tokens_before'),
    tokensAfter: integer('tokens_after'),
    tookMs: integer('took_ms'),
    retried: integer('retried').notNull(),
    why: text('why'),
    dismissedAt: integer('dismissed_at'),
    boundaryId: blob('boundary_id', { mode: BLOB_MODE }).$type<RowId<'boundary'>>(),
    origin: text('origin').notNull(),
    answer: text('answer'),
    queued: integer('queued').notNull(),
});
