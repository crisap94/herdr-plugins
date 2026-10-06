import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NOTHING_HIDDEN } from '#src/ports/column-visibility.ts';
import { memoryStore } from './support.ts';

test('nothing saved is nothing hidden; what is saved reads back, in order', () => {
    const { visibility } = memoryStore();
    assert.deepEqual(visibility.readHidden(), NOTHING_HIDDEN);
    const state = { all: true, hidden: ['w1:t3', 'w1:t1'], shown: ['w1:t2'] };
    visibility.writeHidden(state);
    assert.deepEqual(visibility.readHidden(), state);
});

test('a write replaces the previous one; everything shown again is nothing hidden but the blanket stays off', () => {
    const { visibility } = memoryStore();
    visibility.writeHidden({ all: true, hidden: ['w1:t1'], shown: [] });
    visibility.writeHidden({ all: false, hidden: [], shown: [] });
    assert.deepEqual(visibility.readHidden(), { all: false, hidden: [], shown: [] });
});

test('a damaged row reads as nothing hidden, never a throw', () => {
    const { visibility, db } = memoryStore();
    visibility.writeHidden({ all: false, hidden: ['w1:t1'], shown: [] });
    db.exec('PRAGMA ignore_check_constraints = ON');
    db.exec("UPDATE tab_visibility SET state = 7");
    assert.deepEqual(visibility.readHidden(), NOTHING_HIDDEN);
});
