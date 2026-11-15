import { blob, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { compositeKey } from './columns.ts';
import type { PaneId, TabId } from '#src/recap/domain/ids.ts';
import { BLOB_MODE } from './constants.ts';

export const fact = sqliteTable('fact', {
    id: blob('id', { mode: BLOB_MODE }).$type<Uint8Array>().primaryKey().notNull(),
    tabId: text('tab_id').$type<TabId>().notNull(),
    taskId: blob('task_id', { mode: BLOB_MODE }).$type<Uint8Array>().notNull(),
    section: text('section').notNull(),
    text: text('text').notNull(),
    why: text('why'),
    ref: text('ref'),
    agent: text('agent'),
    firstAt: integer('first_at').notNull(),
    lastAt: integer('last_at').notNull(),
    state: text('state').notNull(),
    closedWhy: text('closed_why'),
    closedAt: integer('closed_at'),
    bornRun: blob('born_run', { mode: BLOB_MODE }).$type<Uint8Array>().notNull(),
    lastRun: blob('last_run', { mode: BLOB_MODE }).$type<Uint8Array>().notNull(),
    language: text('language').notNull(),
    anchor: text('anchor'),
});

export const factTurn = sqliteTable('fact_turn', {
    factId: blob('fact_id', { mode: BLOB_MODE }).$type<Uint8Array>().notNull(),
    transcriptId: blob('transcript_id', { mode: BLOB_MODE }).$type<Uint8Array>().notNull(),
    at: integer('at').notNull(),
}, compositeKey('factId', 'transcriptId', 'at'));

export const verdict = sqliteTable('verdict', {
    id: blob('id', { mode: BLOB_MODE }).$type<Uint8Array>().primaryKey().notNull(),
    runId: blob('run_id', { mode: BLOB_MODE }).$type<Uint8Array>().notNull(),
    itemKey: text('item_key'),
    checkId: text('check_id').notNull(),
    pass: integer('pass').notNull(),
    critique: text('critique'),
    judge: text('judge').notNull(),
    at: integer('at').notNull(),
    source: text('source').notNull(),
});

export const ask = sqliteTable('ask', {
    exchange: text('exchange').notNull(),
    requester: text('requester').notNull(),
    id: text('id').notNull(),
    pane: text('pane').$type<PaneId>().notNull(),
    at: integer('at').notNull(),
    ref: text('ref'),
    outcome: text('outcome'),
}, compositeKey('exchange', 'requester', 'id'));

export const handoffAnswer = sqliteTable('handoff_answer', {
    id: blob('id', { mode: BLOB_MODE }).$type<Uint8Array>().primaryKey().notNull(),
    at: integer('at').notNull(),
    outcome: text('outcome').notNull(),
    reason: text('reason'),
});
