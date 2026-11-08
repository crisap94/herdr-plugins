import { blob, integer, sqliteView, text } from 'drizzle-orm/sqlite-core';
import type { RowId } from './columns.ts';
import type { TabId } from '#src/recap/domain/ids.ts';
import { BLOB_MODE } from './constants.ts';

export const runReadable = sqliteView('run_readable', {
    id: text('id'),
    chapterId: text('chapter_id'),
    at: integer('at'),
    cause: text('cause'),
    backend: text('backend'),
    language: text('language'),
    costMicroUsd: integer('cost_micro_usd'),
    error: text('error'),
}).existing();

export const taskReadable = sqliteView('task_readable', {
    id: text('id'),
    tabId: text('tab_id').$type<TabId>(),
    key: text('key'),
}).existing();

export const factReadable = sqliteView('fact_readable', {
    id: text('id'),
    tabId: text('tab_id').$type<TabId>(),
    taskId: text('task_id'),
    section: text('section'),
    text: text('text'),
    why: text('why'),
    ref: text('ref'),
    agent: text('agent'),
    firstAt: integer('first_at'),
    lastAt: integer('last_at'),
    state: text('state'),
    closedWhy: text('closed_why'),
    closedAt: integer('closed_at'),
    anchor: text('anchor'),
}).existing();

export const openFacts = sqliteView('open_facts', {
    id: blob('id', { mode: BLOB_MODE }).$type<RowId<'fact'>>(),
    tabId: text('tab_id').$type<TabId>(),
    taskId: blob('task_id', { mode: BLOB_MODE }).$type<RowId<'task'>>(),
    section: text('section'),
    text: text('text'),
    why: text('why'),
    ref: text('ref'),
    agent: text('agent'),
    firstAt: integer('first_at'),
    lastAt: integer('last_at'),
    state: text('state'),
    closedWhy: text('closed_why'),
    closedAt: integer('closed_at'),
    bornRun: blob('born_run', { mode: BLOB_MODE }).$type<RowId<'run'>>(),
    lastRun: blob('last_run', { mode: BLOB_MODE }).$type<RowId<'run'>>(),
    language: text('language'),
    anchor: text('anchor'),
}).existing();

export const handoffAnswerReadable = sqliteView('handoff_answer_readable', {
    id: text('id'),
    at: integer('at'),
    outcome: text('outcome'),
    reason: text('reason'),
}).existing();

export const lastGoodRun = sqliteView('last_good_run', {
    tabId: text('tab_id').$type<TabId>(),
    runId: blob('run_id', { mode: BLOB_MODE }).$type<RowId<'run'>>(),
}).existing();

export const lastGoodRunByChapter = sqliteView('last_good_run_by_chapter', {
    chapterId: blob('chapter_id', { mode: BLOB_MODE }).$type<RowId<'chapter'>>(),
    runId: blob('run_id', { mode: BLOB_MODE }).$type<RowId<'run'>>(),
}).existing();
