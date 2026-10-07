import { test } from 'node:test';
import assert from 'node:assert/strict';
import { itemsToFacts, NOT_RECORDED, normalised, whyOf } from '#src/adapters/db/import/items-to-facts.ts';
import type { ImportedItem, ImportedRun } from '#src/adapters/db/import/items-to-facts.ts';

const item = (section: ImportedItem['section'], text: string, position = 0): ImportedItem => ({ section, position, text });
const run = (name: string, at: number, items: readonly ImportedItem[], good = true): ImportedRun => ({ run: name, at, language: 'en', good, items });

test('normalising: lower case, punctuation out, whitespace folded', () => {
    assert.equal(normalised('  Released 1.10.0,   through CI! '), 'released 1100 through ci');
    assert.equal(normalised('Released 1100 through CI'), normalised('released 1.10.0 through ci.'));
});

test('one fact, many runs: equal items collapse, first = the first run\'s time, last = the last run that carried it', () => {
    const line = 'Released 1.10.0 through CI';
    const facts = itemsToFacts([run('r3', 30, [item('done', line)]), run('r4', 40, [item('done', `${line}.`)]), run('r9', 90, [item('done', line.toLowerCase()), item('done', 'Wrote the notes', 1)])]);
    const released = facts.find((fact) => fact.text.toLowerCase().startsWith('released'));
    assert.deepEqual([facts.length, released?.firstAt, released?.lastAt, released?.bornRun, released?.lastRun, released?.closed], [2, 30, 90, 'r3', 'r9', null]);
});

test('open = the last good run\'s items; everything else is closed as rewritten at the first run that no longer carried it', () => {
    const facts = itemsToFacts([
        run('r1', 10, [item('now', 'Fixing the lint job'), item('next', 'Merge !34', 1)]),
        run('r2', 20, [item('now', 'Fixing the lint job'), item('done', 'Merged !34')]),
        run('r3', 30, [item('now', 'Writing the release notes'), item('done', 'Merged !34')]),
    ]);
    const state = (text: string): unknown => { const fact = facts.find((each) => each.text === text); return [fact?.closed?.why ?? 'open', fact?.closed?.at ?? null, fact?.lastAt]; };
    assert.deepEqual(state('Fixing the lint job'), ['rewritten', 30, 20]);
    assert.deepEqual(state('Merge !34'), ['rewritten', 20, 10]);
    assert.deepEqual(state('Merged !34'), ['open', null, 30]);
    assert.deepEqual(state('Writing the release notes'), ['open', null, 30]);
});

test('a run with an error is not the last good one: its items count for history, the open set stays that of the last good run, and open facts are stamped with the good run\'s time', () => {
    const facts = itemsToFacts([run('r1', 10, [item('done', 'First thing')]), run('r2', 20, [item('done', 'First thing'), item('done', 'Second thing', 1)], false)]);
    const first = facts.find((fact) => fact.text === 'First thing');
    const second = facts.find((fact) => fact.text === 'Second thing');
    assert.deepEqual([first?.closed, first?.lastAt, first?.lastRun], [null, 10, 'r1'], 'stamped with the last good run');
    assert.deepEqual([second?.closed?.why, second?.lastAt], ['rewritten', 20], 'only in the run with an error: closed, last seen there');
});

test('goals: the last good run\'s goal stays open, earlier distinct goals are closed as superseded', () => {
    const facts = itemsToFacts([run('r1', 10, [item('goal', 'Ship 1.10')]), run('r2', 20, [item('goal', 'Ship 2.0')]), run('r3', 30, [item('goal', 'Ship 2.0')])]);
    assert.deepEqual(facts.map((fact) => [fact.text, fact.closed?.why ?? 'open', fact.closed?.at ?? null]), [['Ship 1.10', 'superseded', 20], ['Ship 2.0', 'open', null]]);
});

test('decisions: the why is the part after the first : or —, else the reason clause, else "(not recorded)"; other sections have none', () => {
    assert.equal(whyOf('Use SQLite: it needs no server'), 'it needs no server');
    assert.equal(whyOf('Use SQLite — one file to back up'), 'one file to back up');
    assert.equal(whyOf('Keep the db tab alone because it is not part of this'), 'because it is not part of this');
    assert.equal(whyOf('Leave the db tab alone'), NOT_RECORDED);
    const facts = itemsToFacts([run('r1', 10, [item('decisions', 'Leave the db tab alone'), item('done', 'Because of that, wrote it', 1)])]);
    assert.deepEqual(facts.map((fact) => [fact.section, fact.why]), [['decisions', NOT_RECORDED], ['done', null]]);
});

test('the same text in two sections is two facts; the order of the open facts is the last good run\'s order (its positions)', () => {
    const facts = itemsToFacts([run('r1', 10, [item('next', 'Check !34', 2), item('done', 'Check !34'), item('next', 'Second', 1), item('next', 'Zeroth', 0)])]);
    assert.equal(facts.length, 4);
    assert.deepEqual(facts.filter((fact) => fact.section === 'next').map((fact) => fact.text), ['Zeroth', 'Second', 'Check !34']);
});

test('a task that never had a good run has only closed facts', () => {
    const facts = itemsToFacts([run('r1', 10, [item('done', 'x')], false)]);
    assert.deepEqual(facts.map((fact) => [fact.closed?.why, fact.closed?.at]), [['rewritten', 10]]);
});
