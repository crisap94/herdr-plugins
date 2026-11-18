import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixtureHistory, storeMechanismCases } from '@stateforge-labs/session-ledger-sqlite/testkit';

const PLAN_IDS = [
    'OPN-1', 'OPN-2', 'OPN-3', 'OPN-4', 'OPN-5', 'OPN-6', 'OPN-7',
    'MIG-1', 'MIG-2', 'MIG-3', 'MIG-4', 'MIG-5', 'MIG-6',
    'BAK-1', 'BAK-2', 'BAK-3',
    'TXN-1', 'TXN-2', 'TXN-3',
    'CLS-1', 'CLS-2',
    'ROL-1', 'ROL-2', 'ROL-3', 'ROL-4', 'ROL-5', 'ROL-6',
    'EVS-1', 'EVS-2', 'EVS-3',
];

test('the case ids are the thirty of PK 3.3 in plan order', () => {
    assert.deepEqual(storeMechanismCases.map((kase) => kase.id), PLAN_IDS);
});

test('every case id is unique', () => {
    const ids = storeMechanismCases.map((kase) => kase.id);
    assert.equal(new Set(ids).size, ids.length);
});

test('fixtureHistory numbers its steps from 1 to n', () => {
    assert.deepEqual(fixtureHistory(3).map((step) => step.version), [1, 2, 3]);
});

test('fixtureHistory with a gap skips one version', () => {
    assert.deepEqual(fixtureHistory(3, { gapAt: 2 }).map((step) => step.version), [1, 3, 4]);
});
