import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readPaneSession } from '#src/adapters/herdr-fleet.ts';
import { isUnknown } from '#src/ports/unknowable.ts';

async function fakeHerdr(reply: (method: string) => unknown): Promise<{ path: string; calls: string[]; done: () => void }> {
    const dir = mkdtempSync(join(tmpdir(), 'pane-session-'));
    const path = join(dir, 'herdr.sock');
    const calls: string[] = [];
    const server = createServer((socket) => {
        socket.setEncoding('utf8');
        socket.on('data', (chunk: string) => {
            for (const line of chunk.split('\n').filter((entry) => entry !== '')) {
                const request = JSON.parse(line) as { id: string; method: string };
                calls.push(request.method);
                socket.write(`${JSON.stringify({ id: request.id, result: reply(request.method) })}\n`);
            }
        });
    });
    await new Promise<void>((resolve) => { server.listen(path, resolve); });
    return { path, calls, done: (): void => { server.close(); rmSync(dir, { recursive: true }); } };
}

async function withHerdr<T>(path: string, body: () => Promise<T>): Promise<T> {
    const before = process.env['HERDR_SOCKET_PATH'];
    process.env['HERDR_SOCKET_PATH'] = path;
    try {
        return await body();
    } finally {
        if (before === undefined) {
            delete process.env['HERDR_SOCKET_PATH'];
        } else {
            process.env['HERDR_SOCKET_PATH'] = before;
        }
    }
}

test('pane.get names the session by its id', async () => {
    const herdr = await fakeHerdr(() => ({ pane: { pane_id: 'w28:p1', agent_session: { source: 'claude', agent: 'claude', kind: 'id', value: 'new-session' } } }));
    try {
        assert.equal(await withHerdr(herdr.path, () => readPaneSession('w28:p1')), 'new-session');
        assert.deepEqual(herdr.calls, ['pane.get'], 'one read of the pane, nothing else');
    } finally {
        herdr.done();
    }
});

test('a session reported as a path is named by its file name', async () => {
    const herdr = await fakeHerdr(() => ({ pane: { pane_id: 'w28:p1', agent_session: { source: 'claude', agent: 'claude', kind: 'path', value: '/home/u/.claude/projects/-x/4ce6fce1-e940.jsonl' } } }));
    try {
        assert.equal(await withHerdr(herdr.path, () => readPaneSession('w28:p1')), '4ce6fce1-e940');
    } finally {
        herdr.done();
    }
});

test('a pane with no session reads as none, and a reply without the pane is none too (not the lane\'s old session)', async () => {
    const none = await fakeHerdr(() => ({ pane: { pane_id: 'w28:p1', agent_session: null } }));
    const unlike = await fakeHerdr(() => ({ panes: [] }));
    try {
        assert.equal(await withHerdr(none.path, () => readPaneSession('w28:p1')), null);
        assert.equal(await withHerdr(unlike.path, () => readPaneSession('w28:p1')), null);
    } finally {
        none.done();
        unlike.done();
    }
});

test('herdr cannot be reached: unknown, so the lane\'s own session serves', async () => {
    const found = await withHerdr(join(tmpdir(), 'no-such-herdr-for-pane-session.sock'), () => readPaneSession('w28:p1'));
    assert.equal(typeof found === 'object' && found !== null && isUnknown(found), true);
});
