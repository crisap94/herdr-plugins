// A compaction asked through a `compact-req-<tool>` token: parsed, queued with origin `request`, answered in `tab-recap-compact`, each id once.
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
const board = (): Board => ({ ...emptyBoard(), lanes: new Map([[lane.pane, lane]]) });

/** A frame as herdr's `pane.updated` carries it: the pane and its merged tokens. */
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
    assert.deepEqual(askedOf('r7'), { id: 'r7', note: null });
    assert.deepEqual(askedOf('r7:focus: the API'), { id: 'r7', note: 'focus: the API' });
    assert.deepEqual(askedOf('r7:'), { id: 'r7', note: null });
    assert.equal(askedOf(''), null);
    assert.equal(askedOf('x'.repeat(17)), null);
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
