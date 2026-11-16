import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Line } from '#src/daemon/slots.ts';
import { launchEnv, runIntent, type Connection, type IntentParts, type Launch } from '#src/daemon/view/intents.ts';
import { must } from '#src/protocol/result.ts';
import { parseTabId, type TabId } from '#src/recap/domain/ids.ts';
import type { CompactNote } from '#src/recap/domain/compact-note.ts';
import type { Role } from '#src/wire/view/protocol.ts';

interface Calls {
    readonly observed: unknown[];
    readonly shown: string[];
    readonly asked: string[];
    readonly queued: unknown[];
    readonly launched: Launch[];
    readonly logged: Line[];
    closed: number;
}

const TAB: TabId = must(parseTabId('t1'));

const fake = (note: CompactNote): { calls: Calls; parts: IntentParts } => {
    const calls: Calls = { observed: [], shown: [], asked: [], queued: [], launched: [], logged: [], closed: 0 };
    const parts: IntentParts = {
        observe: (observation) => {
            calls.observed.push(observation);
        },
        show: (tab) => {
            calls.shown.push(String(tab));
            return Promise.resolve({ kind: 'done' });
        },
        compact: {
            askNote: (tab) => {
                calls.asked.push(tab);
                return Promise.resolve({ kind: 'done' });
            },
            queue: (request) => {
                calls.queued.push(request);
                return { kind: 'done' };
            },
        },
        compactNote: () => note,
        launch: (launch) => {
            calls.launched.push(launch);
        },
        log: (line) => {
            calls.logged.push(line);
        },
    };
    return { calls, parts };
};

const connection = (role: Role, calls: Calls): Connection => ({
    role,
    tab: TAB,
    close: () => {
        calls.closed += 1;
    },
});

const settled = (): Promise<void> => new Promise((resolve) => {
    setImmediate(resolve);
});

test('refresh and hide reach the observer, and show reaches the show port', async () => {
    const { calls, parts } = fake('skip');
    const sink = runIntent(parts);
    sink({ kind: 'refresh' }, connection('column', calls));
    sink({ kind: 'hide' }, connection('column', calls));
    sink({ kind: 'show-modal' }, connection('column', calls));
    await settled();
    assert.deepEqual(calls.observed, [
        { kind: 'requested', tab: TAB },
        { kind: 'visibility', target: { tab: TAB }, hidden: true },
    ]);
    assert.deepEqual(calls.shown, ['t1']);
    assert.deepEqual(calls.logged, []);
    assert.equal(calls.closed, 0);
});

test('compact in a column queues the request when the note setting is skip', async () => {
    const { calls, parts } = fake('skip');
    runIntent(parts)({ kind: 'compact' }, connection('column', calls));
    await settled();
    assert.deepEqual(calls.queued, [{ tab: 't1', pane: null, note: null }]);
    assert.deepEqual(calls.asked, []);
    assert.equal(calls.closed, 0);
});

test('compact in a column asks for a note when the setting is ask', async () => {
    const { calls, parts } = fake('ask');
    runIntent(parts)({ kind: 'compact' }, connection('column', calls));
    await settled();
    assert.deepEqual(calls.asked, ['t1']);
    assert.deepEqual(calls.queued, []);
});

test('compact in the modal launches the compact column and ends the modal', async () => {
    const { calls, parts } = fake('skip');
    runIntent(parts)({ kind: 'compact' }, connection('modal', calls));
    await settled();
    assert.deepEqual(calls.launched, [{ kind: 'compact', tab: TAB }]);
    assert.equal(calls.closed, 1);
    assert.deepEqual(calls.queued, []);
});

test('configure in a column launches the configure pane and keeps the connection', () => {
    const { calls, parts } = fake('skip');
    runIntent(parts)({ kind: 'configure' }, connection('column', calls));
    assert.deepEqual(calls.launched, [{ kind: 'configure', tab: TAB, role: 'column' }]);
    assert.equal(calls.closed, 0);
});

test('configure in the modal launches the configure pane and ends the modal', () => {
    const { calls, parts } = fake('skip');
    runIntent(parts)({ kind: 'configure' }, connection('modal', calls));
    assert.deepEqual(calls.launched, [{ kind: 'configure', tab: TAB, role: 'modal' }]);
    assert.equal(calls.closed, 1);
});

test('the compact launch env matches the column main env', () => {
    assert.deepEqual(launchEnv({ kind: 'compact', tab: TAB }), {
        TAB_RECAP_TAB: 't1',
        TAB_RECAP_COMPACT_DELAY_MS: '400',
    });
});

test('the configure launch env matches the column main env for a column and a modal', () => {
    assert.deepEqual(launchEnv({ kind: 'configure', tab: TAB, role: 'column' }), {
        HERDR_PLUGIN_CONTEXT_JSON: '',
        HERDR_TAB_ID: 't1',
        TAB_RECAP_OPEN_DELAY_MS: '0',
    });
    assert.deepEqual(launchEnv({ kind: 'configure', tab: TAB, role: 'modal' }), {
        HERDR_PLUGIN_CONTEXT_JSON: '',
        HERDR_TAB_ID: 't1',
        TAB_RECAP_OPEN_DELAY_MS: '400',
    });
});
