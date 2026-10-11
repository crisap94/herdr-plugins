import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Requests } from '#src/ports/requests.ts';
import { requestId } from '#src/protocol/primitives.ts';
import { must } from '#src/protocol/result.ts';
import { paneId, tabId } from '#src/recap/domain/ids.ts';
import { memoryStore } from './db/support.ts';
import { MemoryRequests } from './fakes/requests.ts';

interface Subject {
    readonly name: string;
    readonly make: () => Requests;
}

const subjects: readonly Subject[] = [
    { name: 'SQLite', make: () => memoryStore().requests },
    { name: 'in-memory double', make: () => new MemoryRequests() },
];

const HANDOFF = { tab: tabId('w1:t1'), pane: paneId('w1:p1'), toPane: paneId('w1:p2'), note: 'the note', refreshFirst: true, source: { kind: 'live' } as const };

for (const { name, make } of subjects) {
    test(`${name}: a handoff keeps the requester's answer id; a handoff the command wrote has none`, () => {
        const requests = make();
        requests.requestHandoff({ ...HANDOFF, note: null, refreshFirst: false, answer: must(requestId('h1', 'token-safe')) });
        requests.requestHandoff({ ...HANDOFF, note: null, refreshFirst: false });
        assert.deepEqual(requests.takeHandoffs().map((row) => row.answer ?? null), ['h1', null]);
    });
}

for (const { name, make } of subjects) {
    test(`${name}: a handoff is taken once, with its fields, and withdrawn only while it is queued`, () => {
        const requests = make();
        const id = requests.requestHandoff(HANDOFF);
        assert.deepEqual(requests.takeHandoffs().map((row) => [row.id, row.tab, row.pane, row.toPane, row.refreshFirst, row.note]), [[id, 'w1:t1', 'w1:p1', 'w1:p2', true, 'the note']]);
        assert.deepEqual(requests.takeHandoffs(), []);
        assert.equal(requests.withdrawHandoff(id), false, 'a taken handoff is not withdrawn');
    });

    test(`${name}: withdrawing a queued handoff removes it and reports it`, () => {
        const requests = make();
        const id = requests.requestHandoff({ ...HANDOFF, note: null, refreshFirst: false });
        assert.equal(requests.withdrawHandoff(id), true);
        assert.equal(requests.withdrawHandoff(id), false);
        assert.deepEqual(requests.takeHandoffs(), []);
    });

    test(`${name}: each taker takes only its own kind, and the handoff taker takes only handoffs`, () => {
        const requests = make();
        requests.requestHandoff(HANDOFF);
        requests.request('w1:t5');
        requests.requestVisibility({ target: 'w1:t1', hidden: true });
        requests.requestCompact({ tab: 'w1:t1', pane: 'w1:p2', note: null });
        requests.requestCurate('w1:t7');
        assert.deepEqual(requests.takeRequests().map(String), ['w1:t5']);
        assert.equal(requests.takeVisibility().length, 1);
        assert.equal(requests.takeCompactions().length, 1);
        assert.deepEqual(requests.takeCurations().map(String), ['w1:t7']);
        assert.deepEqual(requests.takeAnswered(), []);
        assert.equal(requests.takeHandoffs().length, 1, 'no other taker took the handoff');
        requests.requestHandoff(HANDOFF);
        assert.equal(requests.takeHandoffs().length, 1);
        assert.deepEqual(requests.takeRequests(), []);
    });
}

for (const { name, make } of subjects) {
    test(`${name}: an answered compaction goes to takeAnswered, and an unanswered one stays for takeCompactions`, () => {
        const requests = make();
        requests.requestCompact({ tab: 'w1:t1', pane: paneId('w1:p2'), note: null, answer: 'r9' });
        requests.requestCompact({ tab: 'w1:t1', pane: paneId('w1:p3'), note: null });
        assert.deepEqual(requests.takeAnswered(), [{ pane: 'w1:p2', answer: 'r9' }]);
        assert.deepEqual(requests.takeAnswered(), []);
        assert.deepEqual(requests.takeCompactions().map((request) => request.pane), ['w1:p3']);
    });
}
