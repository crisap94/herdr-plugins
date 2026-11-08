import { blob, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { RowId } from './columns.ts';
import type { PaneId, TabId } from '#src/recap/domain/ids.ts';
import { BLOB_MODE } from './constants.ts';

export const transcript = sqliteTable('transcript', {
    id: blob('id', { mode: BLOB_MODE }).$type<RowId<'transcript'>>().primaryKey().notNull(),
    tabId: text('tab_id').notNull().$type<TabId>(),
    pane: text('pane').notNull().$type<PaneId>(),
    agent: text('agent').notNull(),
    source: text('source').notNull(),
    attached: integer('attached').notNull(),
    position: integer('position').notNull(),
    cursor: integer('cursor').notNull(),
    tail: text('tail'),
    title: text('title'),
    lastPrompt: text('last_prompt'),
    claudeNote: text('claude_note'),
    firstSeen: integer('first_seen').notNull(),
});

export const chapter = sqliteTable('chapter', {
    id: blob('id', { mode: BLOB_MODE }).$type<RowId<'chapter'>>().primaryKey().notNull(),
    tabId: text('tab_id').notNull().$type<TabId>(),
    n: integer('n').notNull(),
    startedAt: integer('started_at').notNull(),
});

export const boundary = sqliteTable('boundary', {
    id: blob('id', { mode: BLOB_MODE }).$type<RowId<'boundary'>>().primaryKey().notNull(),
    chapterId: blob('chapter_id', { mode: BLOB_MODE }).$type<RowId<'chapter'>>().notNull(),
    transcriptId: blob('transcript_id', { mode: BLOB_MODE }).$type<RowId<'transcript'>>().notNull(),
    kind: text('kind').notNull(),
    at: integer('at').notNull(),
    trigger: text('trigger'),
    cursor: integer('cursor').notNull(),
    replacesId: blob('replaces_id', { mode: BLOB_MODE }).$type<RowId<'transcript'>>(),
    tokensBefore: integer('tokens_before'),
    tokensAfter: integer('tokens_after'),
    tookMs: integer('took_ms'),
});
