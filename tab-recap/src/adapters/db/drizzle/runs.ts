import { blob, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { compositeKey } from './columns.ts';
import type { TabId } from '#src/recap/domain/ids.ts';
import { BLOB_MODE } from './constants.ts';

export const run = sqliteTable('run', {
    id: blob('id', { mode: BLOB_MODE }).$type<Uint8Array>().primaryKey().notNull(),
    chapterId: blob('chapter_id', { mode: BLOB_MODE }).$type<Uint8Array>().notNull(),
    at: integer('at').notNull(),
    cause: text('cause').notNull(),
    backend: text('backend'),
    language: text('language').notNull(),
    costMicroUsd: integer('cost_micro_usd').notNull(),
    error: text('error'),
    gateStats: text('gate_stats'),
});

export const runTask = sqliteTable('run_task', {
    runId: blob('run_id', { mode: BLOB_MODE }).$type<Uint8Array>().notNull(),
    taskId: blob('task_id', { mode: BLOB_MODE }).$type<Uint8Array>().notNull(),
    position: integer('position').notNull(),
    name: text('name'),
    legacyMarkdown: text('legacy_markdown'),
}, compositeKey('runId', 'taskId'));

export const runTaskLane = sqliteTable('run_task_lane', {
    runId: blob('run_id', { mode: BLOB_MODE }).$type<Uint8Array>().notNull(),
    taskId: blob('task_id', { mode: BLOB_MODE }).$type<Uint8Array>().notNull(),
    transcriptId: blob('transcript_id', { mode: BLOB_MODE }).$type<Uint8Array>().notNull(),
    position: integer('position').notNull(),
}, compositeKey('runId', 'taskId', 'transcriptId'));

export const runRead = sqliteTable('run_read', {
    runId: blob('run_id', { mode: BLOB_MODE }).$type<Uint8Array>().notNull(),
    transcriptId: blob('transcript_id', { mode: BLOB_MODE }).$type<Uint8Array>().notNull(),
    fromCursor: integer('from_cursor').notNull(),
    toCursor: integer('to_cursor').notNull(),
}, compositeKey('runId', 'transcriptId'));

export const runInput = sqliteTable('run_input', {
    runId: blob('run_id', { mode: BLOB_MODE }).$type<Uint8Array>().primaryKey().notNull(),
    document: blob('document', { mode: BLOB_MODE }).$type<Uint8Array>().notNull(),
    bytes: integer('bytes').notNull(),
});

export const task = sqliteTable('task', {
    id: blob('id', { mode: BLOB_MODE }).$type<Uint8Array>().primaryKey().notNull(),
    tabId: text('tab_id').$type<TabId>().notNull(),
    key: text('key').notNull(),
    storyText: text('story_text'),
    storyAt: integer('story_at'),
});

export const item = sqliteTable('item', {
    runId: blob('run_id', { mode: BLOB_MODE }).$type<Uint8Array>().notNull(),
    taskId: blob('task_id', { mode: BLOB_MODE }).$type<Uint8Array>().notNull(),
    view: text('view').notNull(),
    section: text('section').notNull(),
    position: integer('position').notNull(),
    text: text('text').notNull(),
}, compositeKey('runId', 'taskId', 'view', 'section', 'position'));
