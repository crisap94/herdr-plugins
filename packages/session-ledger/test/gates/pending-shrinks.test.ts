import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shrinkViolations, type PairSnapshot } from '../../gates/pending-shrinks.ts';

const FIRST: Omit<PairSnapshot, 'headPending' | 'basePending' | 'baseCases'> = {
    pending: 'tab-recap/test/conformance/pending-FOL.json',
};

const SECOND: Omit<PairSnapshot, 'headPending' | 'basePending' | 'baseCases'> = {
    pending: 'tab-recap/test/conformance/pending-REC.json',
};

const addedMessage = (id: string, pending: string): string =>
    `${id} is added to ${pending} for a case that already exists at the merge base`;

test('an id added to a pending list for a case that exists at the merge base fails', () => {
    const snapshot: PairSnapshot = { ...FIRST, headPending: ['FOL-1'], basePending: [], baseCases: ['FOL-1'] };
    assert.deepEqual(shrinkViolations([snapshot]), [addedMessage('FOL-1', FIRST.pending)]);
});

test('an id added together with a new case passes', () => {
    const snapshot: PairSnapshot = { ...FIRST, headPending: ['FOL-2'], basePending: [], baseCases: ['FOL-1'] };
    assert.deepEqual(shrinkViolations([snapshot]), []);
});

test('a removed id passes', () => {
    const snapshot: PairSnapshot = { ...FIRST, headPending: [], basePending: ['FOL-1'], baseCases: ['FOL-1'] };
    assert.deepEqual(shrinkViolations([snapshot]), []);
});

test('an id already pending at the merge base passes', () => {
    const snapshot: PairSnapshot = { ...FIRST, headPending: ['FOL-1'], basePending: ['FOL-1'], baseCases: ['FOL-1'] };
    assert.deepEqual(shrinkViolations([snapshot]), []);
});

test('an id added for an old case of a second pair with its own case folder fails', () => {
    const snapshot: PairSnapshot = { ...SECOND, headPending: ['REC-10'], basePending: [], baseCases: ['REC-10'] };
    assert.deepEqual(shrinkViolations([snapshot]), [addedMessage('REC-10', SECOND.pending)]);
});

test('an id added together with a new case of a second pair passes', () => {
    const snapshot: PairSnapshot = { ...SECOND, headPending: ['REC-11'], basePending: [], baseCases: ['REC-10'] };
    assert.deepEqual(shrinkViolations([snapshot]), []);
});

test('a removed id of a second pair passes', () => {
    const snapshot: PairSnapshot = { ...SECOND, headPending: [], basePending: ['REC-10'], baseCases: ['REC-10'] };
    assert.deepEqual(shrinkViolations([snapshot]), []);
});

test('each pair is judged against its own case folder', () => {
    const first: PairSnapshot = { ...FIRST, headPending: ['FOL-2'], basePending: [], baseCases: ['FOL-2'] };
    const second: PairSnapshot = { ...SECOND, headPending: ['REC-11'], basePending: [], baseCases: ['FOL-2'] };
    assert.deepEqual(shrinkViolations([first, second]), [addedMessage('FOL-2', FIRST.pending)]);
});
