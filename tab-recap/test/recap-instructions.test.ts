import { createHash } from 'node:crypto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Correction, RecapRequest } from '#src/ports/summarizer.ts';
import type { InputFact } from '#src/ports/recap-input.ts';
import { instant } from '#src/recap/domain/time.ts';
import { instructions } from '#src/adapters/job/prompts/recap-instructions.ts';
import { brand } from '#src/recap/domain/brand.ts';
import { textOf } from '#src/recap/domain/text.ts';
import { positiveCount } from '#src/recap/domain/writer-view.ts';
import { requestOf } from '#test/support.ts';

const MAIN_DIGEST = '9f6881c8ac20bf119018ba96ca42d7f84c5e0a650a9f59f51ec04d58ddbd86bf';
const CLOSE_ANCHOR = 'A close with why "done" or "wrong" carries an "anchor" too: the quote from the input that shows it is done or wrong.';

test('writer instructions are byte-identical to main when close evidence is absent or off', () => {
    assert.equal(createHash('sha256').update(instructions(requestOf())).digest('hex'), MAIN_DIGEST);
    assert.equal(createHash('sha256').update(instructions({ ...requestOf(), closeEvidence: 'off' })).digest('hex'), MAIN_DIGEST);
});

test('writer instructions ask a close as done or wrong for an anchor when close evidence is on', () => {
    const text = instructions({ ...requestOf(), closeEvidence: 'on' });
    assert.equal(text.split(CLOSE_ANCHOR).length - 1, 1);
    assert.equal(text.includes('A close never does.'), false);
});

test('writer instructions explain hidden counts and restrict ids to shown facts', () => {
    const request = requestOf({ ledgers: [{ task: null, facts: [], hidden: new Map([['done', positiveCount(20)]]) }] });
    assert.match(instructions(request), /<hidden section=.*open facts.*cannot see or change.*Never add a fact that repeats one.*ids are only for facts you are shown/);
});

test('writer instructions do not mention hidden counts when the view is full', () => {
    assert.doesNotMatch(instructions(requestOf()), /<hidden section=/);
});

const digest = (text: string): string => createHash('sha256').update(text).digest('hex');
const retryOf = (several: boolean): Correction => ({ refused: [], problems: [], facts: [], tasks: brand<boolean, 'Several'>(several) });
const language = (to: string, from: string): RecapRequest => requestOf({ language: textOf(to), previousLanguage: textOf(from) });
const retrying = (to: string, from: string, several: boolean): RecapRequest => ({ ...language(to, from), retry: retryOf(several) });

const CASES: readonly (readonly [string, () => RecapRequest, string])[] = [
    ['lang-en-same', () => language('en', 'en'), '9f6881c8ac20bf119018ba96ca42d7f84c5e0a650a9f59f51ec04d58ddbd86bf'],
    ['lang-en-diff', () => language('en', 'es'), 'd45971e00f1f2a9ac7a613defb6e9e85f221df0bd3185b7e838d3a3ddce62add'],
    ['lang-es-same', () => language('es', 'es'), 'edc49588407e6a4a9efc9dbdba1dce767c4cf015f54c675b413c3770f9499b56'],
    ['lang-es-diff', () => language('es', 'en'), '1bd2f29cc27c73c2b53436a962b0a8f8da3e0621bb3681000a520043eb451b9f'],
    ['lang-fr-same', () => language('fr', 'fr'), '8d0456a905413966ca0ea1d80b76a8e914a968e9ced6a6352182f216339fd3c4'],
    ['lang-fr-diff', () => language('fr', 'en'), '2e80ae06d763ec0ba1b66d511dc61bb62b7c37ed692d58e05dea08643f81ec21'],
    ['two-ledgers', () => requestOf({ ledgers: [{ task: textOf('t1'), facts: [] }, { task: textOf('t2'), facts: [] }] }), '787d1dc479e0b70bee241dced75c7ce6331c69efb8bafc4f2a5fa9eaa927a1f5'],
    ['close-on', () => ({ ...requestOf(), closeEvidence: 'on' }), '4f5064e73b817eebfd4fb0ac231553bf1901258b49dadae93807fa4fdc80fb9f'],
    ['close-off', () => ({ ...requestOf(), closeEvidence: 'off' }), '9f6881c8ac20bf119018ba96ca42d7f84c5e0a650a9f59f51ec04d58ddbd86bf'],
    ['hidden', () => requestOf({ ledgers: [{ task: null, facts: [], hidden: new Map([['done', positiveCount(20)]]) }] }), '9afdb90403e66ec6c7a87c9ea8e2c79ff8c0d2b80653b2b2ab7f0c2abe585ff7'],
    ['retry-en-true', () => retrying('en', 'es', true), '48f83ef983ac1fac8bfbd064e72cb94550b2cafe2638fe479da9dbf721f6a2c1'],
    ['retry-en-false', () => retrying('en', 'es', false), 'df4962d661d82f6be00fe5d47bbba0f101b7bf6eab44db6af3469d505ac5204c'],
    ['retry-es-true', () => retrying('es', 'en', true), '6780e1cac147965a80fa0100e929561941a3f33f5dbe88cf85bae7f8d0e42727'],
    ['retry-es-false', () => retrying('es', 'en', false), '2d8460f087bd9f80ac99aff3fc52d46671bba0405e364cc7278c4ecf739ffc20'],
];

test('writer instructions keep every prompt case byte-identical to main', () => {
    for (const [name, build, expected] of CASES) {
        assert.equal(digest(instructions(build())), expected, name);
    }
});

const spanish = (id: string, text: string): InputFact =>
    ({ id: textOf(id), section: 'done', text: textOf(text), state: 'open', first: instant(0), last: instant(0), why: null, ref: null, anchor: null, agent: null, closed: null });

const SPANISH_FACTS = [spanish('f1', 'Respuesta entregada al operador'), spanish('f2', 'Migración de la base de datos lista'), spanish('f3', 'Pruebas en verde en la rama')];

test('after a language change the writer is told the ids of the open facts still in the old language', () => {
    const request = { ...requestOf({ ledgers: [{ task: null, facts: SPANISH_FACTS }], language: textOf('en'), previousLanguage: textOf('es') }), notInLanguage: SPANISH_FACTS };
    const lines = instructions(request).split('\n');
    assert.ok(lines.includes('Some open facts in <ledger> are still in Spanish: update every open fact that is not in English, rewritten in English with the same meaning, even when nothing else changed. These open facts are not in English: f1, f2, f3. Rewrite each of these facts as a faithful translation of its own text: keep every number, name, path, identifier, status, condition and reason, and do not add, drop or merge a claim.'));
    assert.ok(!lines.some((line) => line.startsWith('The facts in <ledger> are in')));
});

test('with no open fact in another language the instructions are the ones main sends', () => {
    const switching = requestOf({ ledgers: [{ task: null, facts: SPANISH_FACTS }], language: textOf('en'), previousLanguage: textOf('es') });
    assert.equal(instructions({ ...switching, notInLanguage: [] }), instructions(switching));
    assert.match(instructions(switching), /^The facts in <ledger> are in Spanish: update every open fact that is still relevant, rewritten in English\.$/m);
    assert.doesNotMatch(instructions(switching), /These open facts are not in/);
    assert.doesNotMatch(instructions(requestOf({ language: textOf('en'), previousLanguage: textOf('en') })), /<ledger> are/);
});

test('a correction round keeps its language line without the ids', () => {
    const request = { ...requestOf({ ledgers: [{ task: null, facts: SPANISH_FACTS }], language: textOf('en'), previousLanguage: textOf('es') }), notInLanguage: SPANISH_FACTS, retry: retryOf(false) };
    assert.doesNotMatch(instructions(request), /These open facts are not in/);
    assert.match(instructions(request), /The facts in <ledger> are in Spanish: update every open fact that is still relevant, rewritten in English\./);
});

const IDS_F1 = 'Some open facts in <ledger> are still in {previous}: update every open fact that is not in {language}, rewritten in {language} with the same meaning, even when nothing else changed. These open facts are not in {language}: {ids}. Rewrite each of these facts as a faithful translation of its own text: keep every number, name, path, identifier, status, condition and reason, and do not add, drop or merge a claim.';

const FIDELITY = ' Rewrite each of these facts as a faithful translation of its own text: keep every number, name, path, identifier, status, condition and reason, and do not add, drop or merge a claim.';

test('the id line is the IDS-F1 arm of the language-switch eval with its slots filled in', () => {
    const expected = 'Some open facts in <ledger> are still in Spanish: update every open fact that is not in English, rewritten in English with the same meaning, even when nothing else changed. These open facts are not in English: f1, f2, f3. Rewrite each of these facts as a faithful translation of its own text: keep every number, name, path, identifier, status, condition and reason, and do not add, drop or merge a claim.';
    assert.equal(IDS_F1.replaceAll('{previous}', 'Spanish').replaceAll('{language}', 'English').replace('{ids}', 'f1, f2, f3'), expected);
    const request = { ...requestOf({ ledgers: [{ task: null, facts: SPANISH_FACTS }], language: textOf('en'), previousLanguage: textOf('es') }), notInLanguage: SPANISH_FACTS };
    const line = instructions(request).split('\n').find((candidate) => candidate.startsWith('Some open facts in <ledger>'));
    assert.equal(line, expected);
});

test('the faithful translation sentence comes once, directly after the list of ids', () => {
    const english: InputFact = { ...spanish('f7', 'Tests are green on the branch'), section: 'next' };
    const request = { ...requestOf({ ledgers: [{ task: null, facts: [english] }], language: textOf('es'), previousLanguage: textOf('en') }), notInLanguage: [english] };
    const text = instructions(request);
    assert.equal(text.split(FIDELITY).length, 2);
    assert.ok(text.includes(`These open facts are not in Spanish: f7.${FIDELITY}\n`));
});

test('without ids the faithful translation sentence is never sent', () => {
    const switching = requestOf({ ledgers: [{ task: null, facts: SPANISH_FACTS }], language: textOf('en'), previousLanguage: textOf('es') });
    const retry = { ...switching, notInLanguage: SPANISH_FACTS, retry: retryOf(false) };
    for (const request of [switching, { ...switching, notInLanguage: [] }, requestOf({ language: textOf('en'), previousLanguage: textOf('en') }), retry]) {
        assert.doesNotMatch(instructions(request), /faithful translation/);
    }
});
