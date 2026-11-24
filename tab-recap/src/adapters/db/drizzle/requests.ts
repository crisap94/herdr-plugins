import { blob, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { SessionKey } from '#src/recap/domain/ids.ts';
import { BLOB_MODE } from './constants.ts';

export const request = sqliteTable('request', {
    id: blob('id', { mode: BLOB_MODE }).$type<Uint8Array>().primaryKey().notNull(),
    at: integer('at').notNull(),
    kind: text('kind').notNull(),
    target: text('target').notNull(),
    hidden: text('hidden'),
    pane: text('pane').$type<SessionKey>(),
    note: text('note'),
    origin: text('origin').notNull(),
    answer: text('answer'),
    toPane: text('to_pane').$type<SessionKey>(),
    refreshFirst: integer('refresh_first').notNull(),
    closedAt: integer('closed_at'),
});
