import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { connect, createServer } from 'node:net';
import type { Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SOCKET_PATH_MAX as PATHS_SOCKET_PATH_MAX } from '#src/wire/paths.ts';
import { claimSocket, SOCKET_PATH_MAX } from '#src/wire/socket-claim.ts';

async function inDir(run: (dir: string) => Promise<void>): Promise<void> {
    const dir = mkdtempSync(join(tmpdir(), 'socket-claim-'));
    try {
        await run(dir);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

function listen(path: string): Promise<Server> {
    return new Promise((resolve, reject) => {
        const server = createServer((socket) => socket.end());
        server.once('error', reject);
        server.listen(path, () => resolve(server));
    });
}

const close = (server: Server): Promise<void> => new Promise((resolve) => server.close(() => resolve()));

function answers(path: string): Promise<boolean> {
    return new Promise((resolve) => {
        const socket = connect(path);
        socket.once('connect', () => {
            socket.destroy();
            resolve(true);
        });
        socket.once('error', () => resolve(false));
    });
}

const LISTEN_THEN_WAIT = "require('node:net').createServer().listen(process.argv[1], () => process.stdout.write('up\\n'))";

function staleSocket(path: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['-e', LISTEN_THEN_WAIT, path], { stdio: ['ignore', 'pipe', 'inherit'] });
        child.once('error', reject);
        child.stdout.once('data', () => {
            child.once('exit', () => resolve());
            child.kill('SIGKILL');
        });
    });
}

test('SOCKET_PATH_MAX is 107 bytes and is the same constant as in paths.ts', () => {
    assert.equal(SOCKET_PATH_MAX, 107);
    assert.equal(SOCKET_PATH_MAX, PATHS_SOCKET_PATH_MAX);
});

test('no file at the path: free, and nothing is created', async () => {
    await inDir(async (dir) => {
        const path = join(dir, 'view.sock');
        assert.deepEqual(await claimSocket(path), { kind: 'free' });
        assert.equal(existsSync(path), false);
    });
});

test('a stale socket file that no process listens on: unlinked, free', async () => {
    await inDir(async (dir) => {
        const path = join(dir, 'hooks.sock');
        await staleSocket(path);
        assert.ok(lstatSync(path).isSocket(), 'the killed listener left its socket file behind');
        assert.equal(await answers(path), false);
        assert.deepEqual(await claimSocket(path), { kind: 'free' });
        assert.equal(existsSync(path), false);
    });
});

test('a live listener: live, and the file and the listener are untouched', async () => {
    await inDir(async (dir) => {
        const path = join(dir, 'view.sock');
        const server = await listen(path);
        try {
            const before = lstatSync(path);
            assert.deepEqual(await claimSocket(path), { kind: 'live' });
            const after = lstatSync(path);
            assert.ok(after.isSocket());
            assert.equal(after.ino, before.ino);
            assert.equal(server.listening, true);
            assert.equal(await answers(path), true);
        } finally {
            await close(server);
        }
    });
});

test('a path longer than SOCKET_PATH_MAX bytes: too-long with its byte count, nothing touched; a path of exactly SOCKET_PATH_MAX bytes is not too-long', async () => {
    await inDir(async (dir) => {
        const stem = join(dir, 'x');
        const fill = (bytes: number): string => `${stem}${'é'.repeat(Math.floor((bytes - Buffer.byteLength(stem)) / 2))}${(bytes - Buffer.byteLength(stem)) % 2 === 1 ? 'a' : ''}`;
        const long = fill(SOCKET_PATH_MAX + 1);
        assert.equal(Buffer.byteLength(long), SOCKET_PATH_MAX + 1);
        assert.ok(long.length < SOCKET_PATH_MAX, 'counted in bytes, not characters');
        mkdirSync(long);
        assert.deepEqual(await claimSocket(long), { kind: 'too-long', bytes: SOCKET_PATH_MAX + 1 });
        assert.ok(lstatSync(long).isDirectory());
        const exact = fill(SOCKET_PATH_MAX);
        assert.equal(Buffer.byteLength(exact), SOCKET_PATH_MAX);
        assert.notEqual((await claimSocket(exact)).kind, 'too-long');
    });
});

test('two claims in a row with a bind after the first: the first is free, the second is live', async () => {
    await inDir(async (dir) => {
        const path = join(dir, 'hooks.sock');
        assert.deepEqual(await claimSocket(path), { kind: 'free' });
        const server = await listen(path);
        try {
            assert.deepEqual(await claimSocket(path), { kind: 'live' });
            assert.equal(await answers(path), true);
        } finally {
            await close(server);
        }
    });
});

test('a directory at the path: unknown with a detail, and the directory stays', async () => {
    await inDir(async (dir) => {
        const path = join(dir, 'view.sock');
        mkdirSync(path);
        const claim = await claimSocket(path);
        assert.equal(claim.kind, 'unknown');
        assert.ok(claim.detail.length > 0);
        assert.ok(lstatSync(path).isDirectory());
    });
});
