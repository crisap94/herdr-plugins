import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CURL_MIN_VERSION, curlSupports, parseCurlVersion, renderCurlShim } from '@stateforge-labs/harness-hooks';
import { HOOK_LIMITS } from '#src/wire/hooks/contract.ts';
import { hookShimPath, hooksSocketPath } from '#src/wire/paths.ts';
import { hookFixture, readHookCases, runShim } from './wire/fakes/fake-harness.ts';
import type { FakeHookBehaviour } from './wire/fakes/fake-hook-endpoint.ts';
import { startFakeHookEndpoint } from './wire/fakes/fake-hook-endpoint.ts';

const TEST_SHIM_MS = 1000;

const BEHAVIOURS: readonly FakeHookBehaviour[] = ['absent', 'refuses', 'status-500', 'status-403', 'body-text', 'slow'];

const curlVersion = (): string | undefined => {
    const probe = spawnSync('curl', ['--version'], { encoding: 'utf8' });
    return probe.status === 0 ? parseCurlVersion(probe.stdout) : undefined;
};

const CURL = curlVersion();

if (CURL === undefined) process.stdout.write('NOT COVERED: no curl\n');

function shimIn(stateDir: string, timeoutMs?: number): string {
    const text = renderCurlShim({ harness: 'claude', socketPath: hooksSocketPath(stateDir), tokenSource: 'none', failClosed: false, ...(timeoutMs === undefined ? {} : { timeoutMs }) });
    writeFileSync(hookShimPath(stateDir), text, { mode: 0o700 });
    return text;
}

async function inStateDir(run: (stateDir: string) => Promise<void>): Promise<void> {
    const stateDir = mkdtempSync(join(tmpdir(), 'wire-shim-'));
    try {
        await run(stateDir);
    } finally {
        rmSync(stateDir, { recursive: true, force: true });
    }
}

test('the shim rendered with the contract options posts to /hook/claude over hooks.sock with no token and waits HOOK_LIMITS.shimMs', async () => {
    await inStateDir(async (stateDir) => {
        const text = shimIn(stateDir);
        assert.ok(text.includes(`--max-time '${HOOK_LIMITS.shimMs / 1000}'`));
        assert.ok(text.includes(`--unix-socket '${hooksSocketPath(stateDir)}'`));
        assert.ok(text.includes(`'http://localhost/hook/claude'`));
        assert.ok(text.includes('set --\n'));
        assert.equal(text.includes('authorization'), false);
    });
});

test('the curl of this host is new enough for a shim with no token', { skip: CURL === undefined }, () => {
    assert.ok(CURL !== undefined && curlSupports(CURL, 'none'), `curl ${CURL} >= ${CURL_MIN_VERSION.none}`);
});

test('shim-failures.tsv has one row per endpoint behaviour, each expecting {} and exit 0', () => {
    const rows = hookFixture('shim-failures.tsv').split('\n').filter((line) => line.length > 0);
    assert.equal(rows[0], 'case\tendpoint\tstdout\texit');
    const body = rows.slice(1).map((line) => line.split('\t'));
    assert.deepEqual(body.map(([, endpoint]) => endpoint), BEHAVIOURS);
    for (const [name, , stdout, code] of body) assert.deepEqual([stdout, code], ['{}', '0'], name);
});

test('the shim prints the stdout and exits with the code of every row of shim-failures.tsv', { skip: CURL === undefined }, async () => {
    const rows = hookFixture('shim-failures.tsv').split('\n').filter((line) => line.length > 0).slice(1).map((line) => line.split('\t'));
    const request = readHookCases()[0]?.request;
    for (const [name, endpoint, stdout, code] of rows) {
        await inStateDir(async (stateDir) => {
            shimIn(stateDir, TEST_SHIM_MS);
            const behaviour = BEHAVIOURS.find((b) => b === endpoint);
            assert.ok(behaviour, `${name}: ${endpoint} is a behaviour of the fake endpoint`);
            const fake = await startFakeHookEndpoint(hooksSocketPath(stateDir), behaviour);
            try {
                const result = await runShim(hookShimPath(stateDir), 'Stop', request);
                assert.deepEqual(result, { stdout: `${stdout}\n`, code: Number(code) }, name);
            } finally {
                await fake.stop();
            }
        });
    }
});

test('the shim prints the reply of a case answered by the fake endpoint', { skip: CURL === undefined }, async () => {
    const restore = readHookCases().find((c) => c.name === 'K5-session-start-compact-restore');
    assert.ok(restore);
    await inStateDir(async (stateDir) => {
        shimIn(stateDir, TEST_SHIM_MS);
        const fake = await startFakeHookEndpoint(hooksSocketPath(stateDir), 'reply-from-cases');
        try {
            const result = await runShim(hookShimPath(stateDir), restore.event, restore.request);
            assert.deepEqual(result, { stdout: `${JSON.stringify(restore.reply)}\n`, code: 0 });
            assert.deepEqual(fake.requests, [{ path: '/hook/claude', body: restore.request }]);
        } finally {
            await fake.stop();
        }
    });
});
