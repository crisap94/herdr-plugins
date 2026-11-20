import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { createConnection } from 'node:net';
import type { Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { openStore } from '#src/adapters/db/database.ts';
import type { Store } from '#src/adapters/db/database.ts';
import * as view from '#src/daemon/slots/view.ts';
import type { ViewContext } from '#src/daemon/slots/view.ts';
import { parseRoot } from '#src/daemon/slots.ts';
import type { Line, Root } from '#src/daemon/slots.ts';
import { viewersOf } from '#src/daemon/view/viewers.ts';
import { viewSocketPath } from '#src/wire/paths.ts';
import { LineSplitter, decodeDaemon, encode } from '#src/wire/view/codec.ts';
import { PROTOCOL } from '#src/wire/view/protocol.ts';
import type { DaemonMessage, Hello } from '#src/wire/view/protocol.ts';
import { instant } from '#src/recap/domain/time.ts';

const HELLO: Hello = { t: 'hello', protocol: PROTOCOL, version: '9.9.9', role: 'column', tab: 't1', pane: null, cols: 40, rows: 6, colour: false };

const storeOf = (): Store => {
    const opened = openStore(':memory:');
    if (opened.kind !== 'ready') {
        throw new Error('the in-memory store is not ready');
    }
    return opened;
};

const contextOf = (root: Root, store: Store, logs: Line[]): ViewContext => ({
    root,
    version: null,
    store,
    observe: (): void => undefined,
    clock: { now: () => instant(0) },
    log: (line: Line): void => {
        logs.push(line);
    },
    viewers: viewersOf(),
});

const withConfig = async (dir: string, work: () => Promise<void>): Promise<void> => {
    const before = process.env.HERDR_PLUGIN_CONFIG_DIR;
    process.env.HERDR_PLUGIN_CONFIG_DIR = dir;
    try {
        await work();
    } finally {
        if (before === undefined) {
            delete process.env.HERDR_PLUGIN_CONFIG_DIR;
        } else {
            process.env.HERDR_PLUGIN_CONFIG_DIR = before;
        }
    }
};

const idle = (): void => undefined;

const inbox = (socket: Socket): ((match: (message: DaemonMessage) => boolean) => Promise<DaemonMessage>) => {
    const splitter = new LineSplitter();
    const got: DaemonMessage[] = [];
    let wake = idle;
    socket.on('data', (chunk: Buffer): void => {
        for (const part of splitter.push(chunk)) {
            if (typeof part === 'string') {
                const message = decodeDaemon(part);
                if (!('kind' in message)) {
                    got.push(message);
                }
            }
        }
        wake();
    });
    return async (match: (message: DaemonMessage) => boolean): Promise<DaemonMessage> => {
        let found = got.find(match);
        while (found === undefined) {
            await new Promise<void>((resolve): void => {
                wake = resolve;
            });
            found = got.find(match);
        }
        return found;
    };
};

test('the view slot serves the view socket at mode 0600 in an owner-only folder, answers a ping and says bye shutdown on stop', async () => {
    const root = mkdtempSync(join(tmpdir(), 'view-slot-'));
    const store = storeOf();
    const logs: Line[] = [];
    try {
        await withConfig(join(root, 'config'), async (): Promise<void> => {
            const running = await view.slot.start(contextOf(parseRoot(root), store, logs));
            const path = viewSocketPath(root);
            assert.equal(statSync(path).mode & 0o777, 0o600);
            assert.equal(statSync(dirname(path)).mode & 0o777, 0o700);
            const client = createConnection(path);
            await once(client, 'connect');
            const next = inbox(client);
            client.write(encode(HELLO));
            await next((message) => message.t === 'frame');
            client.write(encode({ t: 'ping' }));
            assert.deepEqual(await next((message) => message.t === 'pong'), { t: 'pong' });
            const bye = next((message) => message.t === 'bye');
            await running.stop();
            assert.deepEqual(await bye, { t: 'bye', why: 'shutdown', protocol: PROTOCOL, version: 'unknown' });
            assert.equal(existsSync(path), false);
            assert.deepEqual(logs, []);
        });
    } finally {
        store.close();
        rmSync(root, { recursive: true, force: true });
    }
});

test('a second view slot on a root whose socket is taken starts nothing and logs why', async () => {
    const root = mkdtempSync(join(tmpdir(), 'view-slot-'));
    const store = storeOf();
    const logs: Line[] = [];
    try {
        await withConfig(join(root, 'config'), async (): Promise<void> => {
            const context = contextOf(parseRoot(root), store, logs);
            const first = await view.slot.start(context);
            const second = await view.slot.start(context);
            assert.equal(logs.length, 1);
            assert.match(logs[0] ?? '', /view socket not free/);
            await second.stop();
            await first.stop();
            assert.equal(existsSync(viewSocketPath(root)), false);
        });
    } finally {
        store.close();
        rmSync(root, { recursive: true, force: true });
    }
});

test('the view slot makes an existing shared socket folder owner-only before it listens', async () => {
    const root = mkdtempSync(join(tmpdir(), 'view-slot-'));
    const store = storeOf();
    const logs: Line[] = [];
    const folder = dirname(viewSocketPath(root));
    mkdirSync(folder);
    chmodSync(folder, 0o755);
    try {
        await withConfig(join(root, 'config'), async (): Promise<void> => {
            const running = await view.slot.start(contextOf(parseRoot(root), store, logs));
            assert.equal(statSync(folder).mode & 0o777, 0o700);
            await running.stop();
        });
    } finally {
        store.close();
        rmSync(root, { recursive: true, force: true });
    }
});
