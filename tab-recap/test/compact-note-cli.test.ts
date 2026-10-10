import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { stateStore } from '#src/adapters/db/database.ts';

const entry = join(import.meta.dirname, '..', 'bin', 'tab-recap.ts');
const CONTEXT = JSON.stringify({ tab_id: 'w1:t1', pane_id: 'w1:p2' });

function run(args: readonly string[], setting?: string, newer = false): { status: number | null; stdout: string; stderr: string; queued: unknown[]; done: () => void } {
    const root = mkdtempSync(join(tmpdir(), 'tab-recap-compact-'));
    const state = join(root, 'state');
    const env: Record<string, string> = { PATH: process.env['PATH'] ?? '', HOME: root, HERDR_PLUGIN_CONFIG_DIR: join(root, 'config'), TAB_RECAP_STATE: state, TAB_RECAP_LOCALE: 'en', HERDR_PLUGIN_CONTEXT_JSON: CONTEXT };
    if (setting !== undefined) {
        env['TAB_RECAP_COMPACT_NOTE'] = setting;
    }
    if (newer) {
        mkdirSync(state, { recursive: true });
        const db = new DatabaseSync(join(state, 'tab-recap.db'));
        db.exec('PRAGMA user_version = 9999');
        db.close();
    }
    const ran = spawnSync(process.execPath, [entry, ...args], { encoding: 'utf8', env });
    const store = stateStore(state);
    const queued = store.kind === 'ready' ? store.requests.takeCompactions().map(({ tab, pane, note }) => ({ tab, pane, note })) : [];
    if (store.kind === 'ready') {
        store.close();
    }
    return { status: ran.status, stdout: ran.stdout, stderr: ran.stderr, queued, done: () => { rmSync(root, { recursive: true, force: true }); } };
}

test('the default (ask): the popup is the path, and with no herdr behind it the popup fails and nothing is queued', () => {
    const ran = run(['compact']);
    try {
        assert.equal(ran.status, 1, ran.stdout);
        assert.match(ran.stderr, /the modal did not open/);
        assert.deepEqual(ran.queued, []);
    } finally {
        ran.done();
    }
});

test('TAB_RECAP_COMPACT_NOTE=skip: no popup, the request is queued with no note', () => {
    const ran = run(['compact'], 'skip');
    try {
        assert.equal(ran.status, 0, ran.stderr);
        assert.match(ran.stdout, /compaction requested/);
        assert.deepEqual(ran.queued, [{ tab: 'w1:t1', pane: 'w1:p2', note: null }]);
    } finally {
        ran.done();
    }
});

test('compact --note "<text>": queued at once with that note, no popup, whatever the setting says', () => {
    for (const setting of ['ask', 'skip']) {
        const ran = run(['compact', '--note', 'keep the tests'], setting);
        try {
            assert.equal(ran.status, 0, ran.stderr);
            assert.doesNotMatch(ran.stderr, /modal/);
            assert.deepEqual(ran.queued, [{ tab: 'w1:t1', pane: 'w1:p2', note: 'keep the tests' }], `setting ${setting}`);
        } finally {
            ran.done();
        }
    }
});

test('a multi-line --note is queued as one line', () => {
    const ran = run(['compact', '--note', 'line one\nline two\tend']);
    try {
        assert.equal(ran.status, 0, ran.stderr);
        assert.deepEqual(ran.queued, [{ tab: 'w1:t1', pane: 'w1:p2', note: 'line one line two end' }]);
    } finally {
        ran.done();
    }
});

test('a request the state store cannot take says it was not requested, with the reason', () => {
    const ran = run(['compact'], 'skip', true);
    try {
        assert.equal(ran.status, 1, ran.stdout);
        assert.match(ran.stderr, /the compaction was not requested \(unreadable: the state store is not ready\)/);
        assert.doesNotMatch(ran.stderr, /modal/, 'no popup was asked for');
        assert.deepEqual(ran.queued, []);
    } finally {
        ran.done();
    }
});

test('compact --note "": queued with no note, and no popup even when the setting is ask', () => {
    const ran = run(['compact', '--note', '']);
    try {
        assert.equal(ran.status, 0, ran.stderr);
        assert.doesNotMatch(ran.stderr, /modal/);
        assert.deepEqual(ran.queued, [{ tab: 'w1:t1', pane: 'w1:p2', note: null }]);
    } finally {
        ran.done();
    }
});

test('--note on another command is a usage error naming it, and a --note with no text is one too', () => {
    const other = run(['show', '--note', 'keep']);
    try {
        assert.equal(other.status, 2);
        assert.match(other.stderr, /--note applies to compact only/);
    } finally {
        other.done();
    }
    const missing = run(['compact', '--note']);
    try {
        assert.equal(missing.status, 2);
        assert.match(missing.stderr, /--note/);
    } finally {
        missing.done();
    }
});
