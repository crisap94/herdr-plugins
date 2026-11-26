import assert from 'node:assert/strict';
import { test } from 'node:test';
import { legacyCreateEngine as createEngine } from '@stateforge-labs/session-ledger';
import { legacyPlugsOf } from '@stateforge-labs/session-ledger';
import { laneOf } from '@stateforge-labs/session-ledger';
import { createEngineWorld, createMemoryStore, factOf, followed, key, running, scope, session, text, usd } from '@stateforge-labs/session-ledger/testkit';
import { instant } from '@stateforge-labs/session-ledger';
import { textOf } from '@stateforge-labs/session-ledger';
import { scopeIdOf, sessionKeyOf } from '@stateforge-labs/session-ledger';
import { type RecapTask } from '@stateforge-labs/session-ledger';

const tab = 'tab-1';

const recapTask = (id: string, lanes: readonly string[]): RecapTask => ({ id: textOf(id), name: textOf(id), sessions: lanes.map((lane) => sessionKeyOf(lane)), sections: null, markdown: textOf(`task ${id}`) });

test('restore returns the open and recently closed facts of the task that holds the session, with the last run and the clock', () => {
    const world = createEngineWorld();
    world.clock.set(10_000);
    const store = createMemoryStore({
        recap: { scope: scopeIdOf(tab), sessions: [], tasks: [recapTask('a', ['p1']), recapTask('b', ['p2'])], at: instant(5_000), running: running(false), backend: null, error: null, costUsd: usd(0), language: text('en') },
        lastRun: { at: instant(5_000), cause: 'focused' },
        facts: [
            factOf('open-a', { task: { scope: scopeIdOf(tab), key: textOf('a') }, text: textOf('open in a') }),
            factOf('closed-a', { task: { scope: scopeIdOf(tab), key: textOf('a') }, state: 'closed', closedAt: instant(9_000), text: textOf('closed in a') }),
            factOf('open-b', { task: { scope: scopeIdOf(tab), key: textOf('b') }, text: textOf('open in b') }),
        ],
    });
    const plugs = legacyPlugsOf({ ...world.plugs, store: { records: store.records, facts: store.facts } });
    const engine = createEngine({ source: plugs.source, store: plugs.store, models: plugs.models, environment: plugs.environment, settings: plugs.settings });
    const lane = laneOf(scope(tab), followed(key('p1'), { session: session('s1') }));
    assert.ok(lane !== null);

    const restored = engine.restore(lane.scope, lane);

    assert.equal(restored.at, 10_000);
    assert.deepEqual(restored.lastRun, { at: 5_000, cause: 'focused' });
    assert.deepEqual(restored.open.map((fact) => fact.text), ['open in a']);
    assert.deepEqual(restored.closed.map((fact) => fact.text), ['closed in a']);
});
