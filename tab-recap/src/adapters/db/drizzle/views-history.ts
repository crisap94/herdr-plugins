import { blob, integer, sqliteView, text } from 'drizzle-orm/sqlite-core';
import type { PaneId, TabId } from '#src/recap/domain/ids.ts';
import { BLOB_MODE } from './constants.ts';

export const transcriptReadable = sqliteView('transcript_readable', {
    id: text('id'),
    tabId: text('tab_id').$type<TabId>(),
    pane: text('pane').$type<PaneId>(),
    agent: text('agent'),
    source: text('source'),
    attached: integer('attached'),
    position: integer('position'),
    cursor: integer('cursor'),
    tail: text('tail'),
    title: text('title'),
    lastPrompt: text('last_prompt'),
    claudeNote: text('claude_note'),
    firstSeen: integer('first_seen'),
}).existing();

export const chapterReadable = sqliteView('chapter_readable', {
    id: text('id'),
    tabId: text('tab_id').$type<TabId>(),
    n: integer('n'),
    startedAt: integer('started_at'),
}).existing();

export const chapterSpan = sqliteView('chapter_span', {
    chapterId: blob('chapter_id', { mode: BLOB_MODE }).$type<Uint8Array>(),
    tabId: text('tab_id').$type<TabId>(),
    n: integer('n'),
    startedAt: integer('started_at'),
    sealedAt: integer('sealed_at'),
    cause: text('cause'),
}).existing();

export const boundaryReadable = sqliteView('boundary_readable', {
    id: text('id'),
    chapterId: text('chapter_id'),
    transcriptId: text('transcript_id'),
    kind: text('kind'),
    at: integer('at'),
    trigger: text('trigger'),
    cursor: integer('cursor'),
    replacesId: text('replaces_id'),
    tokensBefore: integer('tokens_before'),
    tokensAfter: integer('tokens_after'),
    tookMs: integer('took_ms'),
}).existing();

export const closedLaneReadable = sqliteView('closed_lane_readable', {
    tabId: text('tab_id').$type<TabId>(),
    pane: text('pane').$type<PaneId>(),
    closedAt: integer('closed_at'),
    agent: text('agent'),
    cwd: text('cwd'),
    taskId: text('task_id'),
    taskName: text('task_name'),
}).existing();
