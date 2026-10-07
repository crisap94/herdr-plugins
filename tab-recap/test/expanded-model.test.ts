import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CURATING_MS, ExpandedModel, newestChange } from '#src/recap/application/expanded-view.ts';
import type { ExpandedDeps } from '#src/recap/application/expanded-view.ts';
import { blankRecap } from '#src/ports/recap-records.ts';
import type { TabView } from '#src/ports/tab-views.ts';
import { expanded } from '#src/recap/render/expanded.ts';
import { en } from '#src/i18n/en.ts';
import { plain } from '#src/recap/render/wrap.ts';
import { cursor, memoryStore, must, seed } from '#test/db/support.ts';
import { fact } from '#test/fakes/fact-at.ts';
import { MemoryLedger } from '#test/fakes/memory-ledger.ts';
import { NOW } from '#test/fakes/expanded-fixture.ts';

const MIN = 60_000;
const T1 = { tab: 'w1:t1', key: 't1' };
const view: TabView = { tab: 'w1:t1', column: null, at: NOW, lanes: [{ pane: 'w1:p1', agent: 'claude', status: 'idle', title: 'orchestrator', cwd: null, context: { tokens: 100_000, window: 200_000, source: 'agent' }, web: { base: 'https://git.example/acme/shop', forge: 'gitlab', branch: 'main' } }] };

function setup(ledger = new MemoryLedger().seed(fact('f1', 'now', 'Running the tests', NOW - 20 * MIN))): { model: ExpandedModel; ledger: MemoryLedger; store: ReturnType<typeof memoryStore>; asked: string[] } {
    const store = memoryStore();
    seed(store, { ...blankRecap('w1:t1'), at: NOW - 3 * 60 * MIN, lanes: [cursor('w1:p1')], tasks: [{ id: 't1', name: '', lanes: ['w1:p1'], sections: null, markdown: '## Goal\n- x' }] });
    const asked: string[] = [];
    const deps: ExpandedDeps = { records: store.records, ledger, stories: store.stories, session: store.session, boundaries: store.boundaries, requests: { requestCurate: (tab) => { asked.push(tab); } }, edits: () => [{ path: 'src/a.ts', count: 3 }] };
    return { model: new ExpandedModel(deps), ledger, store, asked };
}

test('the view is built from the store alone: the task\'s facts, the session facts from the store and the lanes, the lanes\' webs', () => {
    const { model, store } = setup();
    assert.equal(model.read('w1:t1', view, NOW).session.runs, null, 'the imported run is not a turn');
    store.records.recordRun({ tab: 'w1:t1', at: NOW - MIN, cause: 'turn-ended', backend: 'claude', language: 'en', costUsd: 0, error: null, lanes: [cursor('w1:p1')], tasks: [{ id: 't1', name: '', lanes: ['w1:p1'] }], ops: [] });
    const data = model.read('w1:t1', view, NOW);
    assert.deepEqual(data.tasks.map((task) => [task.name, task.facts.map((one) => one.text), task.story]), [['', ['Running the tests'], null]]);
    assert.deepEqual(data.session.agents, [{ label: 'claude · orchestrator', share: 50, window: 200_000 }]);
    assert.deepEqual(data.session.repo, { name: 'shop', branch: 'main' });
    assert.deepEqual(data.session.files, [{ path: 'src/a.ts', count: 3 }]);
    assert.deepEqual(data.session.runs, { total: 1, byCause: [{ cause: 'turn-ended', count: 1 }] });
    assert.equal(data.webs.length, 1);
    assert.equal(model.read('w1:t9', null, NOW).tasks.length, 0, 'a tab with no recap has no task');
});

test('a stale story: the curator is asked once, the old paragraph stays with "updating…", and the new one shows when it is stored', () => {
    const { model, store, asked, ledger } = setup();
    store.stories.keep({ task: T1, at: NOW - 60 * MIN, language: 'en' }, { story: 'The old paragraph.', merges: [] });
    ledger.seed(fact('f2', 'next', 'A fact since the paragraph', NOW - 10 * MIN));
    const first = model.read('w1:t1', view, NOW);
    assert.deepEqual(asked, ['w1:t1']);
    assert.equal(first.tasks[0]?.curating, true);
    const drawn = expanded({ ...first, width: 100, messages: en, style: plain, now: NOW, zone: 'UTC' }).join('\n');
    assert.match(drawn, /SESSION SO FAR · \d\d:\d\d · updating…\nThe old paragraph\./u);
    model.read('w1:t1', view, NOW + 1000);
    model.read('w1:t1', view, NOW + 2000);
    assert.equal(asked.length, 1, 'once per change, however often it redraws');
    store.stories.keep({ task: T1, at: NOW + 3000, language: 'en' }, { story: 'The new paragraph.', merges: [] });
    const later = model.read('w1:t1', view, NOW + 4000);
    assert.equal(must(later.tasks[0]).curating, false);
    assert.equal(must(later.tasks[0]).story?.text, 'The new paragraph.');
    assert.equal(asked.length, 1);
});

test('a story as new as the ledger asks for nothing; another change asks again; a request unanswered for ten minutes stops saying "updating…"', () => {
    const { model, store, asked, ledger } = setup();
    store.stories.keep({ task: T1, at: NOW, language: 'en' }, { story: 'Fresh.', merges: [] });
    assert.equal(model.read('w1:t1', view, NOW).tasks[0]?.curating, false);
    assert.deepEqual(asked, []);
    ledger.seed(fact('f2', 'done', 'Shipped it', NOW + 5000));
    assert.equal(model.read('w1:t1', view, NOW + 6000).tasks[0]?.curating, true);
    assert.equal(asked.length, 1);
    assert.equal(model.read('w1:t1', view, NOW + 6000 + CURATING_MS).tasks[0]?.curating, false, 'given up on, the old paragraph still shows');
    assert.equal(model.read('w1:t1', view, NOW + 7000 + CURATING_MS).tasks[0]?.story?.text, 'Fresh.');
    ledger.seed(fact('f3', 'done', 'And more', NOW + CURATING_MS + 8000));
    model.read('w1:t1', view, NOW + CURATING_MS + 9000);
    assert.equal(asked.length, 2, 'a new change is a new request');
});

test('a task with no facts has nothing to curate; a closed fact is a change too', () => {
    assert.equal(newestChange([]), null);
    const closed = fact('f1', 'now', 'x', 100, { state: 'closed', closedWhy: 'done', closedAt: 900, lastAt: 100 });
    assert.equal(newestChange([closed, fact('f2', 'now', 'y', 500)]), 900);
    const { model, asked } = setup(new MemoryLedger());
    assert.equal(model.read('w1:t1', view, NOW).tasks[0]?.curating, false);
    assert.deepEqual(asked, []);
});
