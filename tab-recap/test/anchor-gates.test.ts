import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anchoredLine } from '#src/recap/application/replay-report.ts';
import { anchorGate, quotedIn } from '#src/recap/domain/gates/g11-anchor.ts';
import { answeredGate } from '#src/recap/domain/gates/g12-answered.ts';
import { correctionOf, gatekeeper } from '#src/recap/domain/gates/gatekeeper.ts';
import type { GateContext } from '#src/recap/domain/gates/gate.ts';
import { foldedOf } from '#src/recap/domain/gates/words.ts';
import type { Operation } from '#src/recap/domain/ops.ts';
import { factOf } from './fakes/facts.ts';

const INPUT = foldedOf('Merged !256 after both pipelines went green.\n  The release is tagged:   v1.9.0 — "ship it"\nERROR: lint failed');
const decision = factOf('decisions', 'Keep SQLite', { why: 'one file to back up' });
const question = factOf('needs', 'Should guests keep their basket?');
const context: GateContext = { now: 1, language: 'en', agents: [], shown: new Map([['f3', decision], ['f4', question]]), closedLately: [], source: INPUT };
const add = (anchor: string | null | undefined): Operation => ({ op: 'add', section: 'done', text: 'Merged !256', why: null, ref: null, at: null, agent: null, ...(anchor === undefined ? {} : { anchor }) });
const gates = [anchorGate, answeredGate];
const update = (anchor?: string): Operation => ({ op: 'update', id: 'f3', text: 'Keep SQLite for 2.0', why: null, ...(anchor === undefined ? {} : { anchor }) });

test('an anchor is found after folding: whitespace and punctuation do not matter, the case does, and a quote is whole words in a row', () => {
    assert.ok(quotedIn('Merged !256 after both pipelines', INPUT));
    assert.ok(quotedIn('both   pipelines\nwent green', INPUT), 'newlines and runs of spaces');
    assert.ok(quotedIn('The release is tagged: v1.9.0', INPUT), 'a colon and a dash in the source are not words');
    assert.ok(quotedIn('"ship it"', INPUT));
    assert.ok(!quotedIn('merged !256', INPUT), 'case is kept');
    assert.ok(!quotedIn('Merge !256', INPUT), 'a prefix of a word is not the word');
    assert.ok(quotedIn('pipelines went green', INPUT) && !quotedIn('Merged after green', INPUT), 'words in a row, not in order with gaps');
    assert.ok(!quotedIn('   ', INPUT) && !quotedIn('...', INPUT), 'a quote of no words is nothing');
});

test('G11: an add without an anchor, or with one the input does not hold, is refused and the correction asks for a copied quote; a found one passes', () => {
    const found = gatekeeper(gates, [add(undefined), add(null), add('the pipeline was green'), add('both pipelines went green')], context);
    assert.deepEqual(found.refused.map((finding) => [finding.at, finding.gate]), [[0, 'G11'], [1, 'G11'], [2, 'G11']]);
    assert.deepEqual(found.kept.length, 1);
    assert.match(found.refused[0]?.reason ?? '', /the anchor is missing: copy a quote of at most 120 characters/);
    assert.match(correctionOf([add('the pipeline was green')], [{ at: 0, gate: 'G11', outcome: 'refuse', reason: found.refused[2]?.reason ?? '' }]), /G11: add done "Merged !256" — the anchor "the pipeline was green" is not in the input: copy it exactly/);
});

test('G11: an update may carry an anchor and then it is checked; a close never has one', () => {
    assert.deepEqual(gatekeeper(gates, [update(), update('the release is tagged')], context).refused.map((finding) => finding.at), [1], 'case is kept: this one is not in the input');
    assert.equal(gatekeeper(gates, [update('The release is tagged')], context).refused.length, 0);
    assert.equal(gatekeeper(gates, [{ op: 'close', id: 'f3', why: 'done' }], context).refused.length, 0);
});

test('G12: closing a decision as answered is refused and lists the reasons that fit; a question may be answered; an unknown id is G6\'s', () => {
    const closed = gatekeeper(gates, [{ op: 'close', id: 'f3', why: 'answered' }], context);
    assert.deepEqual(closed.refused.map((finding) => finding.gate), ['G12']);
    assert.match(closed.refused[0]?.reason ?? '', /f3 is a decisions fact, not a question: close it as done, wrong or superseded/);
    assert.equal(gatekeeper(gates, [{ op: 'close', id: 'f4', why: 'answered' }], context).refused.length, 0);
    assert.equal(gatekeeper(gates, [{ op: 'close', id: 'f3', why: 'superseded' }, { op: 'close', id: 'f9', why: 'answered' }], context).refused.length, 0);
});

test('the report counts the facts that quote their input', () => {
    assert.match(anchoredLine([factOf('done', 'a', { anchor: 'quoted' }), factOf('done', 'b'), factOf('next', 'c', { anchor: 'also quoted' })]), /^facts with an anchor found in the input: 2 of 3 \(67%\)$/);
    assert.match(anchoredLine([]), /0 of 0 \(n\/a\)/);
});
