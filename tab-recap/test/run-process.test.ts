import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { posixProcess } from '#src/adapters/os/process/control-posix.ts';
import { fsPathOf } from '#src/recap/domain/fs-path.ts';
import { textOf, type Text } from '#src/recap/domain/text.ts';
import { uncheckedMilliseconds } from '#src/recap/domain/ids.ts';
import { HerdrTransportError, Method } from '@stateforge-labs/herdr-sdk';
import { createFakeHerdr } from '@stateforge-labs/herdr-sdk/test-kit';
import { usePlugin, resetHerdrClients } from '#src/adapters/herdr/client.ts';

const { run } = posixProcess();

const alive = (pid: number): boolean => {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
};

const base = { input: textOf(''), cwd: fsPathOf(tmpdir()), env: process.env };
const words = (...given: string[]): Text[] => given.map((word) => textOf(word));

test('run: output and exit code, as before', async () => {
    const ran = await run(fsPathOf('sh'), words('-c', 'cat; echo err >&2; exit 3'), { ...base, input: textOf('hello'), timeoutMs: uncheckedMilliseconds(5000) });
    assert.deepEqual([ran.code, ran.stdout, ran.stderr.trim(), ran.ending], [3, 'hello', 'err', 'finished']);
    const missing = await run(fsPathOf('definitely-not-a-program'), words(), { ...base, timeoutMs: uncheckedMilliseconds(5000) });
    assert.equal(missing.code, 127);
});

test('run: a timeout kills the whole process group — a program that ignores SIGTERM is SIGKILLed, children included', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'recap-run-'));
    try {
        const pidFile = join(dir, 'child.pid');
        const began = Date.now();
        const ran = await run(fsPathOf('sh'), words('-c', `trap '' TERM; sleep 60 & echo $! > ${pidFile}; wait`), { ...base, timeoutMs: uncheckedMilliseconds(200), killAfterMs: uncheckedMilliseconds(300) });
        assert.equal(ran.ending, 'timed-out');
        assert.ok(Date.now() - began < 5000, 'it did not wait for the sleep');
        const child = Number(readFileSync(pidFile, 'utf8').trim());
        await new Promise((resolve) => { setTimeout(resolve, 100); });
        assert.equal(alive(child), false, 'the grandchild is gone too');
    } finally {
        rmSync(dir, { recursive: true });
    }
});

test('run: always resolves — a grandchild holding the pipes open cannot hold the promise', async () => {
    const began = Date.now();
    const ran = await run(fsPathOf('sh'), words('-c', 'sleep 30 & echo done; exit 0'), { ...base, timeoutMs: uncheckedMilliseconds(20_000), killAfterMs: uncheckedMilliseconds(500) });
    assert.equal(ran.stdout.trim(), 'done');
    assert.equal(ran.code, 0);
    assert.ok(Date.now() - began < 5000, `resolved in ${Date.now() - began} ms, not after the sleep`);
});

test('subscribe: no ack within the timeout rejects, and says so', async () => {
    const herdr = await createFakeHerdr();
    herdr.silent(Method.EventsSubscribe);
    const before = process.env['HERDR_SOCKET_PATH'];
    process.env['HERDR_SOCKET_PATH'] = herdr.path;
    resetHerdrClients();
    try {
        const began = Date.now();
        await assert.rejects(usePlugin((client) => client.events.subscribe([{ type: 'tab.focused' }], { ackTimeoutMs: 80 })), HerdrTransportError);
        assert.ok(Date.now() - began < 2000);
    } finally {
        if (before === undefined) { delete process.env['HERDR_SOCKET_PATH']; } else { process.env['HERDR_SOCKET_PATH'] = before; }
        resetHerdrClients();
        await herdr.stop();
    }
});

test('run: a program that exits without reading its stdin does not crash the process (EPIPE)', async () => {
    const ran = await run(fsPathOf('sh'), words('-c', 'exit 0'), { ...base, input: textOf('x'.repeat(2_000_000)), timeoutMs: uncheckedMilliseconds(5000) });
    assert.equal(ran.code, 0);
});
