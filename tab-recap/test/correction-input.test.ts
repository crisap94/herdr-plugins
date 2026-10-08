// The retry's document: the refused operations with their reasons and the facts they name, valid against schema/correction-input.dtd, never the transcript.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { InputFact } from '#src/ports/recap-input.ts';
import type { Correction } from '#src/ports/summarizer.ts';
import { instructions } from '#src/adapters/recap-instructions.ts';
import { writerContext } from '#src/recap/application/writer-context.ts';
import { agentOf, requestOf } from './support.ts';
import { dtdTest, validate } from './xmllint.ts';

const at = (clock: string): number => Date.parse(`2026-10-06T${clock}:00Z`);
const fact = (id: string, over: Partial<InputFact> = {}): InputFact =>
    ({ id, section: 'done', text: 'Released 1.10.0', state: 'open', first: at('02:40'), last: at('02:55'), why: null, ref: null, anchor: 'tagged v1.10.0', agent: null, closed: null, ...over });

const RETRY: Correction = {
    tasks: true, problems: ['an add needs a section (goal, now, needs, done, decisions, next, links or rules) and a text'],
    facts: [fact('f4'), fact('f9', { section: 'decisions', why: 'one file', state: 'closed', closed: 'superseded' })],
    refused: [
        { task: 't1', operation: { op: 'add', section: 'decisions', text: 'Leave <db> alone ]]> & stop', why: null, ref: 'src/a.ts', at: at('02:51'), agent: 'orchestrator', anchor: 'leave the "db" tab' }, reasons: [{ gate: 'G3', reason: 'a decision needs its reason: add "because …" or ": <why>"' }] },
        { task: 't2', operation: { op: 'update', id: 'f4', text: 'Released 1.10.0 today', why: null, anchor: null }, reasons: [{ gate: 'G11', reason: 'the anchor is missing' }, { gate: 'G2', reason: 'it repeats f9 ("Released")' }] },
        { task: 't1', operation: { op: 'close', id: 'f9', why: 'answered' }, reasons: [{ gate: 'G12', reason: 'f9 is a decisions fact' }] },
    ],
};

const withRetry = (retry: Correction = RETRY): ReturnType<typeof requestOf> =>
    ({ ...requestOf({ agents: [agentOf('a1', { label: 'orchestrator' })], entries: [{ role: 'user', text: 'a very long transcript that must not come back' }] }), retry });

test('the document holds the refused operations with their reasons and the facts they name, and no transcript', () => {
    const document = writerContext(withRetry());
    assert.match(document, /^<correction_input version="1">\n<tab id="w1:t1" now="2026-10-06T03:05:00Z" zone="UTC"\/>/);
    assert.equal((document.match(/<refused/g) ?? []).length, 3);
    assert.match(document, /<refused task="t1">\s*<operation op="add" section="decisions" at="02:51" agent="a1" ref="src\/a\.ts" anchor="leave the &quot;db&quot; tab"><!\[CDATA\[Leave <db> alone \]\]\]\]><!\[CDATA\[> & stop\]\]><\/operation>/);
    assert.match(document, /<operation op="update" id="f4">Released 1\.10\.0 today<\/operation>\s*<reason gate="G11">the anchor is missing<\/reason>\s*<reason gate="G2">/);
    assert.match(document, /<operation op="close" id="f9" closed="answered"\/>/);
    assert.match(document, /<fact id="f9" section="decisions" state="closed" first="[^"]+" last="[^"]+" why="one file" anchor="tagged v1\.10\.0" closed="superseded">/);
    assert.match(document, /<problem>an add needs a section/);
    assert.ok(!document.includes('transcript') && !document.includes('long transcript') && !document.includes('<recap_input'));
});

dtdTest('DTD: the correction is valid with hostile characters in an operation, several tasks, and only problems', () => {
    for (const retry of [RETRY, { ...RETRY, tasks: false }, { refused: [], problems: ['the shape'], facts: [], tasks: false }]) {
        const verdict = validate(writerContext(withRetry(retry)), 'correction-input.dtd');
        assert.ok(verdict.valid, verdict.output);
    }
});

dtdTest('DTD: broken corrections fail — no tab, an unknown operation, a refusal without a reason, a wrong version', () => {
    const good = writerContext(withRetry());
    assert.ok(validate(good, 'correction-input.dtd').valid);
    for (const [why, broken] of [
        ['no tab', good.replace(/<tab [^>]*\/>/, '')],
        ['an unknown operation', good.replace('op="update"', 'op="rename"')],
        ['a refusal without a reason', good.replace(/<reason gate="G12">[\s\S]*?<\/reason>/, '')],
        ['a wrong version', good.replace('version="1"', 'version="2"')],
    ] as const) {
        assert.ok(!validate(broken, 'correction-input.dtd').valid, why);
    }
});

test('the retry is told only to answer replacements; the first instructions say the correction comes alone', () => {
    const rules = instructions(withRetry());
    assert.match(rules, /Replacements for the refused operations only/);
    assert.match(rules, /an add names its task \("task": "t2"\)/);
    assert.ok(!rules.includes('Every fact you add or update must pass these checks'), 'the retry is short');
    assert.ok(rules.length < instructions(requestOf()).length / 2);
    assert.ok(!instructions({ ...withRetry(), retry: { ...RETRY, tasks: false } }).includes('names its task'));
});
