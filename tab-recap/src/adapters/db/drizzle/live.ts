import { blob, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { compositeKey } from './columns.ts';
import type { PaneId, TabId } from '#src/recap/domain/ids.ts';
import { BLOB_MODE } from './constants.ts';

export const tab = sqliteTable('tab', {
    id: text('id').primaryKey().notNull().$type<TabId>(),
    firstSeen: integer('first_seen').notNull(),
    lastSeen: integer('last_seen').notNull(),
    columnPane: text('column_pane'),
    viewAt: integer('view_at'),
    daemonVersion: text('daemon_version'),
    running: integer('running').notNull(),
    backend: text('backend'),
    error: text('error'),
});

export const lane = sqliteTable(
    'lane',
    {
        tabId: text('tab_id').notNull().$type<TabId>(),
        pane: text('pane').notNull().$type<PaneId>(),
        position: integer('position').notNull(),
        agent: text('agent').notNull(),
        status: text('status').notNull(),
        title: text('title'),
        cwd: text('cwd'),
        lastPrompt: text('last_prompt'),
        webBase: text('web_base'),
        webForge: text('web_forge'),
        webBranch: text('web_branch'),
        contextTokens: integer('context_tokens'),
        contextWindow: integer('context_window'),
        contextSource: text('context_source'),
        since: integer('since'),
    },
    compositeKey('tabId', 'pane'),
);

export const paneAlert = sqliteTable(
    'pane_alert',
    {
        source: text('source').notNull(),
        pane: text('pane').notNull().$type<PaneId>(),
        label: text('label').notNull(),
        at: integer('at').notNull(),
        details: text('details').notNull(),
    },
    compositeKey('source', 'pane'),
);

export const paneNote = sqliteTable(
    'pane_note',
    {
        pane: text('pane').notNull().$type<PaneId>(),
        label: text('label').notNull(),
        value: text('value').notNull(),
    },
    compositeKey('pane', 'label'),
);

export const paneWorktree = sqliteTable('pane_worktree', {
    pane: text('pane').primaryKey().notNull().$type<PaneId>(),
    root: text('root').notNull(),
});

export const tabVisibility = sqliteTable('tab_visibility', {
    tabId: text('tab_id').primaryKey().notNull().$type<TabId>(),
    state: text('state').notNull(),
});

export const columnState = sqliteTable(
    'column_state',
    {
        id: integer('id'),
        allHidden: integer('all_hidden').notNull(),
    },
    compositeKey('id'),
);

export const storeMeta = sqliteTable(
    'store_meta',
    {
        id: integer('id'),
        filesImportedAt: integer('files_imported_at'),
    },
    compositeKey('id'),
);

export const worktreeStatus = sqliteTable('worktree_status', {
    root: text('root').primaryKey().notNull(),
    branch: text('branch').notNull(),
    ahead: integer('ahead'),
    tracked: integer('tracked').notNull(),
    untracked: integer('untracked'),
    at: integer('at').notNull(),
});

export const closedLane = sqliteTable(
    'closed_lane',
    {
        tabId: text('tab_id').notNull().$type<TabId>(),
        pane: text('pane').notNull().$type<PaneId>(),
        closedAt: integer('closed_at').notNull(),
        agent: text('agent').notNull(),
        cwd: text('cwd'),
        taskId: blob('task_id', { mode: BLOB_MODE }).$type<Uint8Array>(),
        taskName: text('task_name'),
    },
    compositeKey('tabId', 'pane', 'closedAt'),
);
