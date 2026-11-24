import assert from 'node:assert/strict';
import { test } from 'node:test';
import { answeredBy, parseFields, type AnswerGround } from '@stateforge-labs/session-ledger/unstable/recap/application/enumerate-answer.ts';
import { RECONCILE_EVERY, Reconciling, reconcileTask, type ReconcilingDeps, type RecapWritten } from '@stateforge-labs/session-ledger/unstable/recap/application/ledger-reconcile.ts';
import type { Curated, Curators } from '@stateforge-labs/session-ledger/unstable/ports/curators.ts';
import type { Entry } from '@stateforge-labs/session-ledger/unstable/ports/transcripts.ts';
import { brand } from '@stateforge-labs/session-ledger/unstable/recap/domain/brand.ts';
import { instant } from '@stateforge-labs/session-ledger/unstable/recap/domain/time.ts';
import { agentKind, cursorAt, paneId, sourcePath } from '@stateforge-labs/session-ledger/testkit';

const textOf = brand<string, 'Text'>;
const count = brand<number, 'Count'>;
const tabOf = brand<string, 'ScopeId'>;
const boundaryOf = brand<boolean, 'Boundary'>;

const entries: readonly Entry[] = [{ role: 'user', text: textOf('please add the retry to the uploader before friday') }, { role: 'agent', text: textOf('done, retry added') }];
const ground: AnswerGround = { agent: textOf('claude'), entries, stubs: [], clock: { now: instant(1_700_000_000_000), zone: textOf('UTC') } };

test('an answer keeps a candidate whose anchor is quoted and counts the ones it loses', () => {
    const answer = JSON.stringify({ candidates: [{ section: 'next', text: 'add the retry', why: 'asked', anchor: 'add the retry to the uploader' }, { section: 'next', text: 'no anchor here' }, 'junk'], skip: [{ stub: 'g1', reason: ' not needed ' }, { stub: 'g2', reason: ' ' }] });
    const got = answeredBy(textOf(`here: ${answer}`), ground);
    assert.ok(got);
    assert.deepEqual(got.candidates.map((one) => [one.section, one.text, one.why, one.anchor, one.agent, one.flagged]), [['next', 'add the retry', 'asked', 'add the retry to the uploader', 'claude', false]]);
    assert.equal(got.lost, 2);
    assert.deepEqual([...got.skipped], [['g1', 'not needed']]);
});

test('an answer that is not an object with candidates is refused whole', () => {
    assert.equal(answeredBy(textOf('nothing'), ground), null);
    assert.equal(answeredBy(textOf('{"candidates":"x"}'), ground), null);
    assert.equal(answeredBy(textOf('{"skip":[]}'), ground), null);
});

const writer = (said: Curated, asked: string[]): Curators => ({ backend: textOf('fake/test'), write: (document) => { asked.push(document); return Promise.resolve(said); } });

const depsOf = (over: Partial<ReconcilingDeps>, logs: string[]): ReconcilingDeps => ({
    ledger: { openOf: () => [], recentlyClosed: () => [], allOf: () => [], keysOf: () => [], historyOf: () => [] },
    stories: { read: () => null, keep: () => ({ changed: [], refused: [] }) },
    writer: () => null,
    clock: () => instant(1_700_000_000_000),
    zone: () => textOf('UTC'),
    language: () => textOf('en'),
    rubric: textOf('rubric'),
    log: (line): void => { logs.push(line); },
    ...over,
});

const event = (turns: number, boundary: boolean): RecapWritten => ({ tab: tabOf('w1:t1'), turns: count(turns), boundary: boundaryOf(boundary) });

test('a reconcile is due every N turns or at once after a boundary, and settles back to zero', () => {
    const reconciling = new Reconciling(depsOf({ every: () => count(3) }, []));
    assert.equal(reconciling.due(event(2, false)), false);
    assert.equal(reconciling.due(event(1, false)), true);
    reconciling.settle(tabOf('w1:t1'));
    assert.equal(reconciling.due(event(2, false)), false);
    assert.equal(reconciling.due(event(0, true)), true);
    assert.equal(RECONCILE_EVERY, 8);
    assert.equal(new Reconciling(depsOf({}, [])).due(event(7, false)), false);
    assert.equal(new Reconciling(depsOf({}, [])).due(event(8, false)), true);
});

test('a task with no tail reader or no writer is not reconciled', async () => {
    const lanes = [{ pane: paneId('w1:p1'), agent: agentKind('claude'), transcript: sourcePath('t'), cursor: cursorAt(0), tail: null, title: null, lastPrompt: null, claudeRecap: null }];
    const target = { id: textOf('t1'), name: textOf('goal'), lanes: [] };
    const reconciling = new Reconciling(depsOf({}, []));
    assert.equal(await reconciling.task(tabOf('w1:t1'), target, lanes, 'open'), false);
});

test('a reconcile with no open fact asks nothing, and an empty answer keeps nothing', async () => {
    const [logs, asked] = [[] as string[], [] as string[]];
    const parts = { writer: writer({ kind: 'curated', text: textOf('{"ops":[]}') }, asked), stories: depsOf({}, logs).stories, language: textOf('en'), rubric: textOf('r'), clock: { now: instant(1), zone: textOf('UTC') }, log: (line: string): void => { logs.push(line); } };
    const task = { tab: tabOf('w1:t1'), key: textOf('t1'), name: textOf('goal'), facts: [], tail: entries, agents: [] };
    await reconcileTask(parts, task);
    assert.deepEqual(asked, []);
    assert.deepEqual(logs, []);
});

test('only a plain object is read as the fields of an answer', () => {
    assert.deepEqual(parseFields({ a: 1 }), { a: 1 });
    assert.equal(parseFields([1]), null);
    assert.equal(parseFields(null), null);
    assert.equal(parseFields('x'), null);
});
