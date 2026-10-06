import { test } from 'node:test';
import assert from 'node:assert/strict';
import { itemsOf, sectionsOf } from '#src/adapters/db/sections-rows.ts';
import { NO_SECTIONS } from '#src/recap/domain/shape.ts';

test('sections ⇄ item rows: the goal is one row, a list one row per bullet, an empty section no rows', () => {
    const sections = { goal: 'ship', now: ['a', 'b'], needs: [], done: ['x', 'y', 'z'], decisions: [], next: ['n'], links: ['f.ts'], rules: ['no force push'] };
    const rows = itemsOf(sections);
    assert.deepEqual(rows.filter((row) => row.section === 'goal'), [{ section: 'goal', position: 0, text: 'ship' }]);
    assert.equal(rows.filter((row) => row.section === 'needs').length, 0);
    assert.deepEqual(sectionsOf(rows), sections);
});

test('sections ⇄ item rows: rows in any order read back in position order; nothing is nothing', () => {
    assert.deepEqual(itemsOf(NO_SECTIONS), []);
    assert.deepEqual(sectionsOf([]), NO_SECTIONS);
    const shuffled = [{ section: 'now', position: 1, text: 'second' }, { section: 'now', position: 0, text: 'first' }];
    assert.deepEqual(sectionsOf(shuffled).now, ['first', 'second']);
});
