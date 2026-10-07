// Each gate, with the rubric's own fail and pass examples: what the file says fails is refused or flagged, what it says passes is accepted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { duplicate } from '#src/recap/domain/gates/duplicate.ts';
import type { Context, Gate, GatedSection, Item } from '#src/recap/domain/gates/gate.ts';
import { wrongLanguage } from '#src/recap/domain/gates/language.ts';
import { unresolved } from '#src/recap/domain/gates/link.ts';
import { narrator } from '#src/recap/domain/gates/narrator.ts';
import { pronounOpener } from '#src/recap/domain/gates/pronoun.ts';
import { notSpecific } from '#src/recap/domain/gates/specific.ts';
import { withoutWhy } from '#src/recap/domain/gates/why.ts';
import { jaccard, tokensOf } from '#src/recap/domain/gates/words.ts';
import { examplesOf } from '#test/rubric.ts';

const item = (section: GatedSection, text: string, position = 0): Item => ({ task: 't1', section, position, text });
const context = (extra: Partial<Context> = {}): Context => ({ language: 'en', agents: ['a1', 'a2', 'orchestrator', 'claude'], earlier: [], ...extra });
const run = (gate: Gate, section: GatedSection, text: string, extra: Partial<Context> = {}): string => gate.check(item(section, text), context(extra))?.kind ?? 'pass';

test('G1 narrator: an agent as the subject is refused (the rubric\'s I5 fail), the work as the subject passes', () => {
    const { pass, fail } = examplesOf('I5');
    assert.equal(run(narrator, 'done', fail), 'refuse');
    assert.equal(run(narrator, 'done', pass), 'pass');
    for (const text of ['The agent is checking the tests.', 'a1 pushed the branch.', 'Orchestrator finished the migration.', 'el agente terminó la migración.']) {
        assert.equal(run(narrator, 'done', text), 'refuse', text);
    }
    assert.equal(run(narrator, 'done', 'Claude’s away summary is passed to the writer.'), 'pass', 'a possessive is not a subject');
    assert.equal(run(narrator, 'done', 'Claude Code settings are merged.'), 'pass');
    assert.equal(run(narrator, 'links', 'claude/retry'), 'pass');
});

test('G1 narrator: a label in "now" is fine as a prefix ("a1: …"), not as a subject', () => {
    assert.equal(run(narrator, 'now', examplesOf('S-now').pass), 'pass');
    assert.equal(run(narrator, 'now', 'a1 is waiting for the readout.'), 'refuse');
    assert.equal(run(narrator, 'done', 'claude: updated the notes.'), 'refuse');
});

test('G2 duplicate: a near-copy of an earlier item of the task is refused and the kept one is named; a different item passes', () => {
    const kept = item('done', examplesOf('I6').pass);
    const copy = run(duplicate, 'done', 'Both pipelines for !256 are green, as checked.', { earlier: [kept] });
    assert.equal(copy, 'refuse');
    assert.match(duplicate.check(item('done', 'Both pipelines for !256 are green, as checked.'), context({ earlier: [kept] }))?.reason ?? '', /"Both pipelines for !256 are green\."/);
    assert.equal(run(duplicate, 'done', 'The release notes are written.', { earlier: [kept] }), 'pass');
    assert.equal(run(duplicate, 'done', kept.text), 'pass', 'nothing earlier, nothing to repeat');
});

test('G2 duplicate: the tokens are lower-cased words of three letters or more', () => {
    assert.deepEqual([...tokensOf('Fix the CI of a1, ok?')].toSorted(), ['fix', 'the']);
    assert.equal(jaccard(new Set(['a', 'b']), new Set(['b', 'c'])), 1 / 3);
    assert.equal(jaccard(new Set(), new Set()), 0);
});

test('G3 decision without why: the rubric\'s S-decisions fail is refused, its pass accepted; Spanish reason words count', () => {
    const { pass, fail } = examplesOf('S-decisions');
    assert.equal(run(withoutWhy, 'decisions', fail), 'refuse');
    assert.equal(run(withoutWhy, 'decisions', pass), 'pass');
    assert.equal(run(withoutWhy, 'decisions', 'Use SQLite because it ships with Node.'), 'pass');
    assert.equal(run(withoutWhy, 'decisions', 'Usa SQLite porque viene con Node.', { language: 'es' }), 'pass');
    assert.equal(run(withoutWhy, 'decisions', 'Keep the sensor on channel 11 during the watch.'), 'refuse');
    assert.equal(run(withoutWhy, 'done', fail), 'pass', 'only decisions need a why');
});

test('G4 link: the rubric\'s S-links fail is refused, its pass accepted; each reference form resolves', () => {
    const { pass, fail } = examplesOf('S-links');
    assert.equal(run(unresolved, 'links', fail), 'refuse');
    assert.equal(run(unresolved, 'links', pass), 'pass');
    for (const text of ['!252', '#12', 'fd8db19', 'feat/tab-recap-judge', '`src/a.ts`', 'README.md', 'https://example.org/docs', 'MR !252 at fd8db19']) {
        assert.equal(run(unresolved, 'links', text), 'pass', text);
    }
    for (const text of ['ctx1', 'staging', 'the merge request', 'abc']) {
        assert.equal(run(unresolved, 'links', text), 'refuse', text);
    }
});

test('G5 language: a clear English line in a Spanish recap (and the reverse) is refused; short, mixed and other languages pass', () => {
    const english = 'The tests are failing after the merge.';
    const spanish = 'Las pruebas fallan después de la fusión.';
    assert.equal(run(wrongLanguage, 'done', english, { language: 'es' }), 'refuse');
    assert.equal(run(wrongLanguage, 'done', spanish, { language: 'en' }), 'refuse');
    assert.equal(run(wrongLanguage, 'done', english), 'pass');
    assert.equal(run(wrongLanguage, 'done', spanish, { language: 'es' }), 'pass');
    assert.equal(run(wrongLanguage, 'done', 'Merged !256', { language: 'es' }), 'pass', 'too short to tell');
    assert.equal(run(wrongLanguage, 'done', english, { language: 'Português' }), 'pass');
    assert.match(wrongLanguage.check(item('done', english), context({ language: 'es' }))?.reason ?? '', /español/);
});

test('G8 not specific (flag): the rubric\'s I3 fail is flagged, its pass is not; each kind of concrete thing counts', () => {
    const { pass, fail } = examplesOf('I3');
    assert.equal(run(notSpecific, 'next', fail), 'flag');
    assert.equal(run(notSpecific, 'next', pass), 'pass');
    for (const text of ['Wait for 333 groups.', 'Restart the `daemon`.', 'Check the ci/lint.sh output.', 'Merge !252.', 'Ask the operator.', 'Compare Paris with Oslo.', 'Fix the setupView bug.', 'Reread pg-01 logs.']) {
        assert.equal(run(notSpecific, 'next', text), 'pass', text);
    }
    assert.equal(run(notSpecific, 'links', 'the thing'), 'pass', 'links have their own gate');
});

test('G9 pronoun opener (flag): the rubric\'s I2 fail is flagged, its pass is not', () => {
    const { pass, fail } = examplesOf('I2');
    assert.equal(run(pronounOpener, 'now', fail), 'flag');
    assert.equal(run(pronounOpener, 'now', pass), 'pass');
    for (const text of ['This breaks the build.', 'That is blocked on review.', 'The issue persists after the retry.', 'Eso falla en la segunda corrida.']) {
        assert.equal(run(pronounOpener, 'next', text), 'flag', text);
    }
    assert.equal(run(pronounOpener, 'next', 'Italy is next on the list.'), 'pass', '"it" inside a longer word is not a pronoun');
});
