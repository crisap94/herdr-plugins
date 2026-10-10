import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyBoard } from '#src/recap/domain/board.ts';
import type { Board } from '#src/recap/domain/board.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import { answerValue, askedOf, endAnswerOf, refusalAnswerOf, VALUE_MAX } from '#src/recap/domain/compact-request.ts';
import { CompactRequests } from '#src/recap/application/compact-requests.ts';
import type { CompactRequest } from '#src/ports/requests.ts';
import { Trail } from '#src/recap/application/compaction-trail.ts';
import type { Records } from '#src/recap/application/compaction-trail.ts';
import { RecordingTokens } from './fakes/lane-tokens.ts';
import { MemoryAsks } from './fakes/ask-records.ts';

const lane = laneFrom({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', status: 'idle' });
const board = (): Board => ({ ...emptyBoard(), seeded: true, lanes: new Map([[lane.pane, lane]]) });

const frame = (pane: string, tokens: Record<string, string>): { readonly pane: { readonly pane_id: string; readonly tokens: Record<string, string> } } => ({ pane: { pane_id: pane, tokens } });

interface Harness {
    readonly asked: CompactRequest[];
    readonly asks?: MemoryAsks;
    readonly tokens: RecordingTokens;
    readonly compact: CompactRequests;
    flush(): Promise<void>;
}

function setup(on = true, asks = new MemoryAsks()): Harness {
    const asked: CompactRequest[] = [];
    const tokens = new RecordingTokens();
    const requests = { requestCompact: (request: CompactRequest): void => { asked.push(request); } };
    const compact = new CompactRequests({ enabled: (): boolean => on, board, requests, asks, tokens, log: (): void => undefined });
    return { asked, asks, tokens, compact, flush: (): Promise<void> => new Promise<void>((resolve) => { setImmediate(resolve); }) };
}

test('askedOf: `<id>` or `<id>:<note>`; the note is everything after the first colon; an empty or long id is refused', () => {
    assert.deepEqual(askedOf('r7'), { id: 'r7', note: null, valid: true });
    assert.deepEqual(askedOf('r7:focus: the API'), { id: 'r7', note: 'focus: the API', valid: true });
    assert.deepEqual(askedOf('r7:'), { id: 'r7', note: null, valid: true });
    assert.equal(askedOf(''), null);
    assert.equal(askedOf('x'.repeat(17))?.valid, false, 'an overlong id is not valid');
    assert.equal(askedOf(':note')?.valid, false, 'an empty id is not valid');
    assert.ok(answerValue('r7', 'running').length <= VALUE_MAX);
    assert.ok((askedOf(`r7:${'n'.repeat(200)}`)?.note?.length ?? 0) + 3 <= VALUE_MAX, 'the note fits the rest of the value');
});

test('a compaction stage word is an answer: done, or failed with its reason', () => {
    assert.equal(endAnswerOf('compacted', null), 'done');
    assert.equal(endAnswerOf('failed', 'unreachable'), 'failed-unreachable');
    assert.equal(endAnswerOf('unconfirmed', null), 'failed-unconfirmed');
    assert.equal(refusalAnswerOf('working'), 'failed-working');
});

test('asked and queued: the request is queued with origin request and the note; the answer is queued', async () => {
    const run = setup();
    run.compact.onPaneUpdated(frame('w1:p1', { 'compact-req-coordinator': 'r7:focus on the API' }));
    await run.flush();
    assert.deepEqual(run.asked, [{ tab: 'w1:t1', pane: 'w1:p1', note: 'focus on the API', origin: 'request', answer: 'r7' }]);
    assert.deepEqual(run.tokens.reports.map((report) => [report.pane, report.tokens]), [['w1:p1', { 'tab-recap-compact': 'r7:queued' }]]);
});

test('the same id is never acted on twice; a new id is', async () => {
    const run = setup();
    run.compact.onPaneUpdated(frame('w1:p1', { 'compact-req-coordinator': 'r7' }));
    run.compact.onPaneUpdated(frame('w1:p1', { 'compact-req-coordinator': 'r7' }));
    run.compact.onPaneUpdated(frame('w1:p1', { 'compact-req-coordinator': 'r8' }));
    assert.deepEqual(run.asked.map((request) => request.answer), ['r7', 'r8']);
});

test('a pane that is not a lane is answered failed-not-a-lane, and nothing is requested', async () => {
    const run = setup();
    run.compact.onPaneUpdated(frame('w9:p9', { 'compact-req-coordinator': 'r7' }));
    await run.flush();
    assert.deepEqual(run.asked, []);
    assert.deepEqual(run.tokens.reports.map((report) => [report.pane, report.tokens]), [['w9:p9', { 'tab-recap-compact': 'r7:failed-not-a-lane' }]]);
});

test('other tokens, and a compact-req with no tool name, are not requests', () => {
    const run = setup();
    run.compact.onPaneUpdated(frame('w1:p1', { 'tab-recap-api': '1', 'typing-coordinator': '5', 'compact-req-': 'r7' }));
    assert.deepEqual(run.asked, []);
});

test('off: nothing is read, nothing is queued and nothing is answered; a request asked while off is not answered later either', async () => {
    const run = setup(false);
    run.compact.onPaneUpdated(frame('w1:p1', { 'compact-req-coordinator': 'r7' }));
    run.compact.answer('r7', 'w1:p1', 'done');
    await run.flush();
    assert.deepEqual(run.asked, []);
    assert.deepEqual(run.tokens.reports, []);
});

test('a compaction ends with its answer: the trail hears how it ended, and the answer says done or the reason', () => {
    const answered: string[] = [];
    const records: Records = { begin: () => 'cmp', advance: () => undefined, finish: () => undefined };
    const ended = new Trail(records, 'cmp', () => 0, (end) => { answered.push(endAnswerOf(end.stage, end.why ?? null)); });
    ended.end('compacted');
    const failed = new Trail(records, 'cmp', () => 0, (end) => { answered.push(endAnswerOf(end.stage, end.why ?? null)); });
    failed.end('failed', { why: 'unreachable' });
    assert.deepEqual(answered, ['done', 'failed-unreachable']);
});

test('the same id again, after a daemon restart: a new handler over the same stored asks requests nothing', async () => {
    const asks = new MemoryAsks();
    const before = setup(true, asks);
    before.compact.onPaneUpdated(frame('w1:p1', { 'compact-req-coordinator': 'r7' }));
    await before.flush();
    const after = setup(true, asks);
    after.compact.onPaneUpdated(frame('w1:p1', { 'compact-req-coordinator': 'r7' }));
    after.compact.onPaneUpdated(frame('w1:p1', { 'compact-req-coordinator': 'r7:another note' }));
    await after.flush();
    assert.deepEqual(before.asked.map((request) => request.answer), ['r7']);
    assert.deepEqual(after.asked, [], 'the id is known to the store: not acted on again');
});

test('the id is per requester: another tool may use the same id', async () => {
    const run = setup(true);
    run.compact.onPaneUpdated(frame('w1:p1', { 'compact-req-coordinator': 'r7' }));
    run.compact.onPaneUpdated(frame('w1:p1', { 'compact-req-reviewer': 'r7' }));
    assert.deepEqual(run.asked.map((request) => request.answer), ['r7', 'r7']);
});

test('a restart interrupts what was asked: each unfinished or queued request is answered failed-interrupted, and none is run', async () => {
    const run = setup(true);
    run.compact.answerInterrupted([{ pane: 'w1:p1', answer: 'r7' }, { pane: 'w1:p2', answer: 'r8' }]);
    await run.flush();
    assert.deepEqual(run.tokens.reports.map((report) => [report.pane, report.tokens]), [
        ['w1:p1', { 'tab-recap-compact': 'r7:failed-interrupted' }],
        ['w1:p2', { 'tab-recap-compact': 'r8:failed-interrupted' }],
    ]);
    assert.deepEqual(run.asked, []);
});

test('off: an interrupted request is not answered either', async () => {
    const run = setup(false);
    run.compact.answerInterrupted([{ pane: 'w1:p1', answer: 'r7' }]);
    await run.flush();
    assert.deepEqual(run.tokens.reports, []);
});

test('a request written while the setting is off is remembered, not acted on: turning it on later runs nothing stale', async () => {
    const asks = new MemoryAsks();
    const off = setup(false, asks);
    off.compact.onPaneUpdated(frame('w1:p1', { 'compact-req-coordinator': 'r7' }));
    const on = setup(true, asks);
    on.compact.onPaneUpdated(frame('w1:p1', { 'compact-req-coordinator': 'r7' }));
    on.compact.onPaneUpdated(frame('w1:p1', { 'compact-req-coordinator': 'r7', 'typing-coordinator': '1' }));
    await on.flush();
    assert.deepEqual(on.asked, []);
});

test('an id that is empty or overlong is answered failed-bad-id once, and the answer does not loop back into another answer', async () => {
    const run = setup(true);
    run.compact.onPaneUpdated(frame('w1:p1', { 'compact-req-coordinator': ':no id' }));
    run.compact.onPaneUpdated(frame('w1:p1', { 'compact-req-coordinator': ':no id', 'tab-recap-compact': ':failed-bad-id' }));
    run.compact.onPaneUpdated(frame('w1:p1', { 'compact-req-coordinator': 'x'.repeat(20) }));
    await run.flush();
    assert.deepEqual(run.tokens.reports.map((report) => report.tokens), [{ 'tab-recap-compact': ':failed-bad-id' }, { 'tab-recap-compact': `${'x'.repeat(16)}:failed-bad-id` }]);
});

test('a request that comes before the board exists waits for it, and is then acted on', async () => {
    const asks = new MemoryAsks();
    let seeded = false;
    const asked: CompactRequest[] = [];
    const tokens = new RecordingTokens();
    const handler = new CompactRequests({
        enabled: (): boolean => true, board: (): Board => ({ ...board(), seeded }), requests: { requestCompact: (request: CompactRequest): void => { asked.push(request); } }, asks, tokens, log: (): void => undefined,
    });
    handler.onPaneUpdated(frame('w1:p1', { 'compact-req-coordinator': 'r9' }));
    assert.deepEqual([asked, tokens.reports, asks.seen('coordinator', 'r9')], [[], [], false], 'not decided, not remembered, before the board');
    seeded = true;
    handler.tick();
    assert.deepEqual(asked.map((request) => request.answer), ['r9'], 'the board exists: it is a lane, so it is queued');
});

test('a request is remembered only after it is queued: a refused queue leaves it free to be asked again', () => {
    const asks = new MemoryAsks();
    const tokens = new RecordingTokens();
    let refuse = true;
    const handler = new CompactRequests({
        enabled: (): boolean => true, board: (): Board => board(), requests: { requestCompact: (): void => { if (refuse) throw new Error('database locked'); } }, asks, tokens, log: (): void => undefined,
    });
    handler.onPaneUpdated(frame('w1:p1', { 'compact-req-coordinator': 'r7' }));
    assert.equal(asks.seen('coordinator', 'r7'), false, 'not remembered: nothing was queued');
    refuse = false;
    handler.onPaneUpdated(frame('w1:p1', { 'compact-req-coordinator': 'r7' }));
    assert.equal(asks.seen('coordinator', 'r7'), true);
});

test('no answer is written on an empty pane', async () => {
    const run = setup(true);
    run.compact.answer('r7', '', 'queued');
    await run.flush();
    assert.deepEqual(run.tokens.reports, []);
});
