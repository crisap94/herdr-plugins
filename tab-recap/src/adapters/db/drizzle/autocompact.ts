import { blob, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { compositeKey } from './columns.ts';
import type { RowId } from './columns.ts';
import type { PaneId, TabId } from '#src/recap/domain/ids.ts';
import type { UncheckedReason } from '#src/recap/domain/autocompact.ts';
import type { DecisionGate, DecisionMode, DecisionVerdict } from '#src/ports/autocompact-records.ts';
import { BLOB_MODE } from './constants.ts';

export const autocompactDecision = sqliteTable('autocompact_decision', {
    id: blob('id', { mode: BLOB_MODE }).$type<RowId<'decision'>>().primaryKey().notNull(),
    tabId: text('tab_id').$type<TabId>().notNull(),
    pane: text('pane').$type<PaneId>().notNull(),
    agent: text('agent').notNull(),
    at: integer('at').notNull(),
    mode: text('mode').$type<DecisionMode>().notNull(),
    share: integer('share').notNull(),
    tokens: integer('tokens').notNull(),
    window: integer('window').notNull(),
    gate: text('gate').$type<DecisionGate>().notNull(),
    verdict: text('verdict').$type<DecisionVerdict>().notNull(),
    answers: text('answers').notNull(),
    coverage: text('coverage'),
    decider: text('decider'),
    costMicroUsd: integer('cost_micro_usd').notNull(),
    tookMs: integer('took_ms'),
    why: text('why'),
    compactionId: blob('compaction_id', { mode: BLOB_MODE }).$type<RowId<'compaction'>>(),
    requested: integer('requested').notNull(),
    askedVerdict: text('asked_verdict').$type<DecisionVerdict>(),
    coverageOutcome: text('coverage_outcome'),
    uncheckedReason: text('unchecked_reason').$type<UncheckedReason>(),
    coverageMissing: integer('coverage_missing'),
    coverageMs: integer('coverage_ms'),
    coverageCostMicroUsd: integer('coverage_cost_micro_usd'),
    laneStatus: text('lane_status'),
});

export const autocompactBrief = sqliteTable('autocompact_brief', {
    decisionId: blob('decision_id', { mode: BLOB_MODE }).$type<RowId<'decision'>>().primaryKey().notNull(),
    briefedAt: integer('briefed_at').notNull(),
    body: blob('body', { mode: BLOB_MODE }).$type<Uint8Array>().notNull(),
});

export const autocompactSkip = sqliteTable(
    'autocompact_skip',
    {
        tabId: text('tab_id').$type<TabId>().notNull(),
        pane: text('pane').$type<PaneId>().notNull(),
        agent: text('agent').notNull(),
        at: integer('at').notNull(),
        gate: text('gate').notNull(),
        share: integer('share'),
        detail: text('detail'),
    },
    compositeKey('tabId', 'pane'),
);
