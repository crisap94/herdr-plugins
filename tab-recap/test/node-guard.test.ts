import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHECK = new URL('../src/adapters/node-check.mjs', import.meta.url).href;

/** Runs the guard in a fresh Node as if the host were `host`; `home` keeps the operator's real config out of it. */
function guarded(kind: string, host: Record<string, unknown>, locale = 'en'): { status: number | null; out: string; err: string } {
    const home = mkdtempSync(join(tmpdir(), 'tab-recap-guard-'));
    try {
        const script = `import { guardNode } from ${JSON.stringify(CHECK)}; await guardNode(${JSON.stringify(kind)}, ${JSON.stringify(host)}); console.log('ran');`;
        const done = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
            encoding: 'utf8', timeout: 10_000,
            env: { ...process.env, HERDR_PLUGIN_CONFIG_DIR: home, TAB_RECAP_STATE: home, TAB_RECAP_LOCALE: locale },
        });
        return { status: done.status, out: done.stdout, err: done.stderr };
    } finally {
        rmSync(home, { recursive: true, force: true });
    }
}

test('a new enough Node passes the guard without a word', () => {
    for (const kind of ['daemon', 'pane', 'command']) {
        const done = guarded(kind, {});
        assert.deepEqual([done.status, done.out, done.err], [0, 'ran\n', ''], kind);
    }
});

test('an old Node stops the daemon and a command with the version, the minimum, the path and the steps', () => {
    for (const kind of ['daemon', 'command']) {
        const done = guarded(kind, { version: 'v20.11.0', path: '/old/bin/node', argv: ['refresh'] });
        assert.equal(done.status, 1, kind);
        assert.match(done.err, /needs Node >= 24\.21\.0, but this is v20\.11\.0 \(\/old\/bin\/node\)/);
        assert.match(done.err, /herdr server stop/);
        assert.doesNotMatch(done.err, /\n\s+at /, 'no stack trace');
        assert.doesNotMatch(done.out, /ran/);
    }
    assert.match(guarded('daemon', { version: 'v20.11.0' }).err, /^\d{4}-\d\d-\d\dT/, 'the log line is dated');
});

test('`status` goes on running on an old Node: it prints the message itself', () => {
    const done = guarded('command', { version: 'v20.11.0', argv: ['status'] });
    assert.deepEqual([done.status, done.out], [0, 'ran\n']);
});

test('the message follows the interface language', () => {
    assert.match(guarded('command', { version: 'v20.11.0', argv: [] }, 'es').err, /necesita Node >= 24\.21\.0, pero este es v20\.11\.0/);
});
