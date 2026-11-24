import type { JsonObject } from '@stateforge-labs/harness-adapters/runtime';
import type { AnswerSchema } from '#src/ports/harness.ts';
import { SECTION_IDS, WRITER_CLOSES } from '@stateforge-labs/session-ledger';
import type { ClosedWhy } from '@stateforge-labs/session-ledger';

const FACT_ID = { type: 'string', minLength: 1 } as const;
const TEXT = { type: 'string' } as const;
const NULLABLE_TEXT = { type: ['string', 'null'] } as const;

const ADD: JsonObject = {
    type: 'object',
    additionalProperties: false,
    required: ['op', 'section', 'text'],
    properties: {
        op: { const: 'add' },
        section: { enum: [...SECTION_IDS] },
        text: TEXT,
        why: NULLABLE_TEXT,
        ref: NULLABLE_TEXT,
        at: NULLABLE_TEXT,
        agent: NULLABLE_TEXT,
        anchor: NULLABLE_TEXT,
    },
};

const UPDATE: JsonObject = {
    type: 'object',
    additionalProperties: false,
    required: ['op', 'id', 'text'],
    properties: {
        op: { const: 'update' },
        id: FACT_ID,
        text: TEXT,
        why: NULLABLE_TEXT,
        anchor: NULLABLE_TEXT,
    },
};

const closeOf = (reasons: readonly ClosedWhy[]): JsonObject => ({
    type: 'object',
    additionalProperties: false,
    required: ['op', 'id', 'why'],
    properties: {
        op: { const: 'close' },
        id: FACT_ID,
        why: { enum: [...reasons] },
        anchor: NULLABLE_TEXT,
    },
});

const opsOf = (items: readonly JsonObject[]): JsonObject => ({
    type: 'array',
    items: { anyOf: [...items] },
});

const WRITER_OPS: JsonObject = opsOf([ADD, UPDATE, closeOf(WRITER_CLOSES)]);

const RECONCILE_CLOSES: readonly ClosedWhy[] = ['done', 'wrong', 'superseded', 'answered', 'merged'];

const RECONCILE_OPS: JsonObject = opsOf([
    {
        type: 'object',
        additionalProperties: false,
        required: ['op', 'id', 'text'],
        properties: { op: { const: 'update' }, id: FACT_ID, text: TEXT, why: NULLABLE_TEXT, evidence: NULLABLE_TEXT },
    },
    {
        type: 'object',
        additionalProperties: false,
        required: ['op', 'id', 'why'],
        properties: { op: { const: 'close' }, id: FACT_ID, why: { enum: [...RECONCILE_CLOSES] }, into: NULLABLE_TEXT, evidence: NULLABLE_TEXT },
    },
]);

const STORY_OPS: JsonObject = opsOf([
    {
        type: 'object',
        additionalProperties: false,
        required: ['op', 'id', 'why'],
        properties: { op: { const: 'close' }, id: FACT_ID, why: { const: 'merged' }, into: FACT_ID },
    },
]);

export const ANSWER_SCHEMAS: Readonly<Record<AnswerSchema, JsonObject>> = {
    writer: {
        type: 'object',
        additionalProperties: false,
        required: ['ops'],
        properties: { ops: WRITER_OPS },
    },
    reconcile: {
        type: 'object',
        additionalProperties: false,
        required: ['ops'],
        properties: { ops: RECONCILE_OPS },
    },
    story: {
        type: 'object',
        additionalProperties: false,
        required: ['ops', 'story'],
        properties: { ops: STORY_OPS, story: TEXT },
    },
};
