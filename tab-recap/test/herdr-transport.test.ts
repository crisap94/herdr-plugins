import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import type { Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rpc, subscribe } from '#src/transport/herdr.ts';
import type { Pushed } from '#src/transport/herdr.ts';

async function withHerdr<T>(script: (socket: Socket, request: { id: string }) => void, run: () => Promise<T>): Promise<T> {
    const dir = mkdtempSync(join(tmpdir(), 'tab-recap-socket-'));
    const path = join(dir, 'herdr.sock');
    const server = createServer((socket) => {
        socket.once('data', (data: Buffer) => { script(socket, JSON.parse(data.toString('utf8')) as { id: string }); });
    });
    await new Promise<void>((resolve) => { server.listen(path, resolve); });
    const before = process.env['HERDR_SOCKET_PATH'];
    process.env['HERDR_SOCKET_PATH'] = path;
    try {
        return await run();
    } finally {
        if (before === undefined) {
            delete process.env['HERDR_SOCKET_PATH'];
        } else {
            process.env['HERDR_SOCKET_PATH'] = before;
        }
        server.close();
        rmSync(dir, { recursive: true, force: true });
    }
}

const later = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms); });

type Script = (socket: Socket, request: { id: string }) => void;

const splitReply: Script = (socket, { id }) => {
    const line = `${JSON.stringify({ id, result: { ok: true } })}\n`;
    socket.write(line.slice(0, 9));
    setTimeout(() => { socket.write(line.slice(9)); }, 20);
};

const splitCharacter: Script = (socket, { id }) => {
    const bytes = Buffer.from(`${JSON.stringify({ id, result: { text: 'caf\u00e9 \ud83d\udcdd' } })}\n`);
    const cut = bytes.indexOf(0xc3) + 1;
    socket.write(bytes.subarray(0, cut));
    setTimeout(() => { socket.write(bytes.subarray(cut)); }, 20);
};

const oneChunk: Script = (socket, { id }) => {
    socket.write([
        JSON.stringify({ id, result: {} }),
        'this is not json',
        '"a string is not an object"',
        JSON.stringify({ event: 'one', data: { n: 1 } }),
        JSON.stringify({ event: 'two', data: { n: 2 } }),
        '',
    ].join('\n'));
};

test('a reply split across two chunks is one message', async () => {
    assert.deepEqual(await withHerdr(splitReply, () => rpc('ping', {})), { ok: true });
});

test('a character split across two chunks arrives whole', async () => {
    assert.deepEqual(await withHerdr(splitCharacter, () => rpc('ping', {})), { text: 'caf\u00e9 \ud83d\udcdd' });
});

test('two messages in one chunk are both delivered, and a malformed line is ignored', async () => {
    const pushed: Pushed[] = [];
    await withHerdr(oneChunk, async () => {
        const live = await subscribe([], (event) => { pushed.push(event); }, () => undefined);
        await later(50);
        live.close();
    });
    assert.deepEqual(pushed, [{ event: 'one', data: { n: 1 } }, { event: 'two', data: { n: 2 } }]);
});
