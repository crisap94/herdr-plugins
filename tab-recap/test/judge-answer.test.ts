import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAnswers, parseCover, parseGrades, parseScore } from '#src/recap/application/judge-answer.ts';
import { must } from '@stateforge-labs/session-ledger';
import { parseCount } from '@stateforge-labs/session-ledger';
import { parseText, type Text } from '@stateforge-labs/session-ledger';

const t = (value: string): Text => must(parseText(value));
const SECTIONS = new Map<Text, Text>([[t('a/0'), t('goal')], [t('a/1'), t('done')]]);

test('a score keeps only verdicts for known items and checks, once each, and carries only whole key-fact numbers inside the list', () => {
    const answer = JSON.stringify({
        verdicts: [
            { item: 'a/0', check: 'I1', pass: true },
            { item: 'a/0', check: 'I1', pass: false, critique: 'dup' },
            { item: 'a/1', check: 'S-done', pass: false, critique: '  too   vague ' },
            { item: 'a/1', check: 'S-goal', pass: true },
            { item: 'zz', check: 'I1', pass: true },
            { item: 'a/1', check: 'I2', pass: 'yes' },
            { item: 'a/1', check: 'I3', pass: false },
        ],
        keyfacts: ['one', 7, ' two  words '],
        coverage: [{ keyfact: 0, item: 'a/0' }, { keyfact: 0, item: 'a/1' }, { keyfact: 1.5, item: 'a/1' }, { keyfact: -1, item: 'a/1' }, { keyfact: 2, item: 'nope' }, { keyfact: 5, item: 'a/1' }],
    });
    const scored = parseScore(t(answer), SECTIONS);
    assert.ok(scored.kind === 'ok');
    assert.deepEqual(scored.value.verdicts.map((verdict) => [verdict.item, verdict.check, verdict.pass, verdict.critique]), [
        ['a/0', 'I1', 'pass', ''],
        ['a/1', 'S-done', 'fail', 'too vague'],
        ['a/1', 'I3', 'fail', '(no critique)'],
    ]);
    assert.deepEqual(scored.value.keyfacts, ['one', 'two words']);
    assert.deepEqual([...scored.value.carried], [[must(parseCount(0)), 'a/0']]);
});

test('a score with no verdicts, or without key facts and coverage lists, is unusable with the reason', () => {
    assert.deepEqual(parseScore(t('not json'), SECTIONS), { kind: 'unusable', why: 'the answer holds no JSON object' });
    assert.deepEqual(parseScore(t('[1]'), SECTIONS), { kind: 'unusable', why: 'the answer holds no JSON object' });
    assert.deepEqual(parseScore(t(JSON.stringify({ verdicts: [{ item: 'a/0', check: 'I1', pass: true }], keyfacts: [], coverage: null })), SECTIONS), { kind: 'unusable', why: 'the answer has no usable verdicts, key facts and coverage' });
});

test('a cover answer takes the given key facts over its own and needs a coverage list', () => {
    const answer = t(JSON.stringify({ keyfacts: ['own'], coverage: [{ keyfact: 1, item: 'a/1' }, { keyfact: 0, item: 'x' }] }));
    const covered = parseCover(answer, SECTIONS, [t('given one'), t('given two')]);
    assert.ok(covered.kind === 'ok');
    assert.deepEqual(covered.value.keyfacts, ['given one', 'given two']);
    assert.deepEqual([...covered.value.carried].map(([at, item]) => [Number(at), item]), [[1, 'a/1'], [0, null]]);
    assert.deepEqual(parseCover(t(JSON.stringify({ keyfacts: ['own'] })), SECTIONS, null), { kind: 'unusable', why: 'the answer has no key facts and coverage' });
});

test('read-back answers are exactly six strings, whitespace collapsed', () => {
    const six = parseAnswers(t(JSON.stringify({ answers: ['a  b', 'c', 'd', 'e', 'f', 'g'] })));
    assert.deepEqual(six, { kind: 'ok', value: ['a b', 'c', 'd', 'e', 'f', 'g'] });
    assert.deepEqual(parseAnswers(t(JSON.stringify({ answers: ['a', 'b', 'c', 'd', 'e', 1] }))), { kind: 'unusable', why: 'the answer is not six strings' });
    assert.deepEqual(parseAnswers(t(JSON.stringify({ answers: ['a'] }))), { kind: 'unusable', why: 'the answer is not six strings' });
});

test('grades need all six whole questions from 1 to 6 with a boolean pass, the first grade per question wins', () => {
    const grades = [1, 2, 3, 4, 5, 6].map((question) => ({ question, pass: question % 2 === 0, critique: 'c' }));
    const parsed = parseGrades(t(JSON.stringify({ grades: [{ question: 1, pass: true }, ...grades, { question: 0, pass: true }, { question: 7, pass: true }, { question: 2.5, pass: true }] })));
    assert.ok(parsed.kind === 'ok');
    assert.deepEqual(parsed.value.map((grade) => [Number(grade.question), grade.pass, grade.critique]), [[1, 'pass', ''], [2, 'pass', ''], [3, 'fail', 'c'], [4, 'pass', ''], [5, 'fail', 'c'], [6, 'pass', '']]);
    assert.deepEqual(parseGrades(t(JSON.stringify({ grades: grades.slice(1) }))), { kind: 'unusable', why: 'the answer does not grade all six questions' });
});
