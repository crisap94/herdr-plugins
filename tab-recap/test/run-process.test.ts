import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '#src/adapters/run.ts';
import { subscribe } from '#src/transport/herdr.ts';

const alive = (pid: number): boolean => {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
};

const base = { input: '', cwd: tmpdir(), env: process.env };

test('run: output and exit code, as before', async () => {
    const ran = await run('sh', ['-c', 'cat; echo err >&2; exit 3'], { ...base, input: 'hello', timeoutMs: 5000 });
    assert.deepEqual([ran.code, ran.stdout, ran.stderr.trim(), ran.timedOut], [3, 'hello', 'err', false]);
    const missing = await run('definitely-not-a-program', [], { ...base, timeoutMs: 5000 });
    assert.equal(missing.code, 127);
});

test('run: a timeout kills the whole process group — a program that ignores SIGTERM is SIGKILLed, children included', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'recap-run-'));
    try {
        const pidFile = join(dir, 'child.pid');
        const began = Date.now();
        const ran = await run('sh', ['-c', `trap '' TERM; sleep 60 & echo $! > ${pidFile}; wait`], { ...base, timeoutMs: 200, killAfterMs: 300 });
        assert.equal(ran.timedOut, true);
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
    const ran = await run('sh', ['-c', 'sleep 30 & echo done; exit 0'], { ...base, timeoutMs: 20_000, killAfterMs: 500 });
    assert.equal(ran.stdout.trim(), 'done');
    assert.equal(ran.code, 0);
    assert.ok(Date.now() - began < 5000, `resolved in ${Date.now() - began} ms, not after the sleep`);
});

test('subscribe: no ack within the timeout rejects, and says so', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'recap-ack-'));
    const path = join(dir, 'herdr.sock');
    const sockets: { destroy(): void }[] = [];
    const server = createServer((socket) => { sockets.push(socket); });
    await new Promise<void>((resolve) => { server.listen(path, resolve); });
    const before = process.env['HERDR_SOCKET_PATH'];
    process.env['HERDR_SOCKET_PATH'] = path;
    try {
        const began = Date.now();
        await assert.rejects(subscribe([{ type: 'tab.focused' }], () => undefined, () => undefined, 80), /no ack in 80 ms/);
        assert.ok(Date.now() - began < 2000);
    } finally {
        if (before === undefined) { delete process.env['HERDR_SOCKET_PATH']; } else { process.env['HERDR_SOCKET_PATH'] = before; }
        sockets.forEach((socket) => { socket.destroy(); });
        server.close();
        rmSync(dir, { recursive: true });
    }
});

test('run: a program that exits without reading its stdin does not crash the process (EPIPE)', async () => {
    const ran = await run('sh', ['-c', 'exit 0'], { ...base, input: 'x'.repeat(2_000_000), timeoutMs: 5000 });
    assert.equal(ran.code, 0);
});
