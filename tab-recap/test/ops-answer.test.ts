import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAnswer } from '#src/recap/application/ops-answer.ts';
import type { Resolving } from '#src/recap/application/ops-answer.ts';
import { agentOf } from '#test/support.ts';

const NOW = Date.parse('2026-10-07T17:00:00Z');
const at = (clock: string): number => Date.parse(`2026-10-07T${clock}:00Z`);
const resolving: Resolving = {
    tasks: ['t1', 't2'], agents: [agentOf('a1', { label: 'orchestrator' }), agentOf('a2')], taskOf: new Map([['f1', 't1'], ['f7', 't2']]),
    turns: [at('16:41'), at('16:55'), Date.parse('2026-10-05T09:10:00Z')], clock: { now: NOW, zone: 'UTC' },
};
const parse = (value: unknown): ReturnType<typeof parseAnswer> => parseAnswer(typeof value === 'string' ? value : JSON.stringify(value), resolving);
const opsOf = (answer: ReturnType<typeof parseAnswer>): readonly unknown[] => (answer.kind === 'ops' ? answer.ops : []);

test('the three operations, with their fields tidied; a fenced answer or one wrapped in a sentence is found', () => {
    const answer = parse('Here you go:\n```json\n{"ops":[{"op":"add","section":"done","text":"- **Merged** !34","why":null,"ref":"!34","at":"16:41","agent":"a1"},{"op":"update","id":"f1","text":"Merge !34 today"},{"op":"close","id":"f7","why":"superseded"}]}\n```');
    assert.deepEqual(opsOf(answer), [
        { task: 't1', op: { op: 'add', section: 'done', text: 'Merged !34', why: null, ref: '!34', at: at('16:41'), agent: 'orchestrator', anchor: null } },
        { task: 't1', op: { op: 'update', id: 'f1', text: 'Merge !34 today', why: null, anchor: null } },
        { task: 't2', op: { op: 'close', id: 'f7', why: 'superseded' } },
    ]);
});

test('an update or close goes to the task that holds the fact; an add goes to the task it names, else the first', () => {
    const tasks = opsOf(parse({ ops: [{ op: 'add', section: 'next', text: 'a', task: 't2' }, { op: 'add', section: 'next', text: 'b' }, { op: 'add', section: 'next', text: 'c', task: 't9' }, { op: 'close', id: 'f99', why: 'done' }] }))
        .map((each) => (each as { task: string }).task);
    assert.deepEqual(tasks, ['t2', 't1', 't1', 't1']);
});

const when = (label: string): unknown => (opsOf(parse({ ops: [{ op: 'add', section: 'done', text: 'x', at: label }] }))[0] as { op: { at: number | null } }).op.at;

test('a time is resolved to the turn of that local time (the latest such), with the date when the turn is not today; no match is no time', () => {
    assert.equal(when('16:55'), at('16:55'));
    assert.equal(when('2026-10-05 09:10'), Date.parse('2026-10-05T09:10:00Z'));
    assert.equal(when('11:11'), null);
    assert.equal(when(''), null);
});

test('an agent the document does not list, or one with no label, is no agent; a why is clipped to 24 words; a reference to 8', () => {
    const first = (opsOf(parse({ ops: [{ op: 'add', section: 'decisions', text: 'x', why: Array.from({ length: 40 }, (_, i) => `w${i}`).join(' '), ref: Array.from({ length: 12 }, (_, i) => `r${i}`).join(' '), agent: 'a9' }] })) as { op: { agent: string | null; why: string; ref: string } }[]).at(0);
    assert.ok(first !== undefined);
    assert.equal(first.op.agent, null);
    assert.equal(first.op.why.split(' ').length, 24);
    assert.equal(first.op.ref.split(' ').length, 8);
    const second = (opsOf(parse({ ops: [{ op: 'add', section: 'done', text: 'x', agent: 'a2' }] })) as { op: { agent: string | null } }[]).at(0);
    assert.equal(second?.op.agent, null, 'a2 has no label to name it by');
});

test('a close may only give done, wrong, superseded or answered: anything else is a close with no why (G10 refuses it)', () => {
    const whys = opsOf(parse({ ops: ['done', 'wrong', 'superseded', 'answered', 'merged', 'rewritten', 'bored', 7, null].map((why) => ({ op: 'close', id: 'f1', why })) })).map((each) => (each as { op: { why: string | null } }).op.why);
    assert.deepEqual(whys, ['done', 'wrong', 'superseded', 'answered', null, null, null, null, null]);
});

test('malformed operations are named, not applied: an unknown op, a missing section or text, a missing id, something that is not an object', () => {
    const answer = parse({ ops: [{ op: 'rename', id: 'f1' }, { op: 'add', section: 'mood', text: 'x' }, { op: 'add', section: 'done' }, { op: 'update', text: 'x' }, { op: 'close' }, 'close f1', { op: 'add', section: 'done', text: 'fine' }] });
    assert.ok(answer.kind === 'ops');
    assert.equal(answer.ops.length, 1);
    assert.equal(answer.problems.length, 6);
    assert.match(answer.problems[0] ?? '', /"rename" is not an operation/);
});

test('an empty list is a valid answer; the old recap shape is told apart from a muddle; nothing usable is invalid, with the reason', () => {
    assert.deepEqual(parse({ ops: [] }), { kind: 'ops', ops: [], problems: [] });
    assert.deepEqual(parse({ goal: 'x', now: [] }), { kind: 'old-shape' });
    assert.deepEqual(parse({ regroup: '', tasks: [] }), { kind: 'old-shape' });
    assert.deepEqual(parse({ foo: 1 }), { kind: 'invalid', why: 'the JSON object has no "ops" list' });
    assert.deepEqual(parse('I could not do that'), { kind: 'invalid', why: 'the answer holds no JSON object' });
    assert.deepEqual(parse('{"ops": [}'), { kind: 'invalid', why: 'the answer is not valid JSON' });
    assert.deepEqual(parse('[1,2]'), { kind: 'invalid', why: 'the answer holds no JSON object' });
});

test('an anchor is tidied to one line and cut to 120 characters at a word; an update may carry one, a close never does', () => {
    const long = Array.from({ length: 40 }, (_, index) => `word${index}`).join(' ');
    const answer = parse({ ops: [
        { op: 'add', section: 'done', text: 'x', anchor: '  Merged !34\n  after green  ' },
        { op: 'add', section: 'done', text: 'y', anchor: long },
        { op: 'add', section: 'done', text: 'z', anchor: 'a'.repeat(300) },
        { op: 'add', section: 'done', text: 'no anchor' },
        { op: 'add', section: 'done', text: 'blank', anchor: '   ' },
        { op: 'update', id: 'f1', text: 'u', anchor: 'the change' },
        { op: 'close', id: 'f7', why: 'done', anchor: 'ignored' },
    ] });
    const anchors = opsOf(answer).map((each) => (each as { op: { anchor?: string | null } }).op.anchor);
    assert.equal(anchors[0], 'Merged !34 after green');
    assert.ok(typeof anchors[1] === 'string' && anchors[1].length <= 120 && long.startsWith(anchors[1]) && /word\d+$/.test(anchors[1]), 'cut back to a whole word');
    assert.equal(anchors[2], 'a'.repeat(120), 'a single long word is cut where it is');
    assert.deepEqual([anchors[3], anchors[4], anchors[5], anchors[6]], [null, null, 'the change', undefined]);
});
