import { rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import { isDeepStrictEqual } from 'node:util';
import { readHookCases } from './fake-harness.ts';

export type FakeHookBehaviour = 'reply-from-cases' | 'absent' | 'refuses' | 'status-500' | 'status-403' | 'body-text' | 'slow';

export interface FakeHookEndpoint {
    readonly requests: { readonly path: string; readonly body: unknown }[];
    stop(): Promise<void>;
}

const JSON_HEADERS = { 'content-type': 'application/json' };

function parsed(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

function replyFromCases(path: string, body: unknown, res: ServerResponse): void {
    const found = readHookCases().find((c) => path === `/hook/${c.harness}` && isDeepStrictEqual(c.request, body));
    if (found === undefined) {
        res.writeHead(404, JSON_HEADERS).end('{"error":"no case"}');
        return;
    }
    res.writeHead(200, JSON_HEADERS).end(JSON.stringify(found.reply));
}

function answer(behaviour: FakeHookBehaviour, path: string, body: unknown, res: ServerResponse): void {
    if (behaviour === 'reply-from-cases') replyFromCases(path, body, res);
    else if (behaviour === 'status-500') res.writeHead(500, JSON_HEADERS).end('{"error":"boom"}');
    else if (behaviour === 'status-403') res.writeHead(403).end('forbidden host');
    else if (behaviour === 'body-text') res.writeHead(200).end('ok');
}

export async function startFakeHookEndpoint(socketPath: string, behaviour: FakeHookBehaviour): Promise<FakeHookEndpoint> {
    rmSync(socketPath, { force: true });
    const requests: { path: string; body: unknown }[] = [];
    if (behaviour === 'absent') return { requests, stop: async () => {} };
    if (behaviour === 'refuses') {
        writeFileSync(socketPath, '');
        return { requests, stop: async () => rmSync(socketPath, { force: true }) };
    }
    const sockets = new Set<Socket>();
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
            const path = req.url ?? '';
            const body = parsed(Buffer.concat(chunks).toString('utf8'));
            requests.push({ path, body });
            answer(behaviour, path, body, res);
        });
    });
    server.on('connection', (socket: Socket) => {
        sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));
    });
    await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(socketPath, resolve);
    });
    return {
        requests,
        stop: () =>
            new Promise<void>((resolve) => {
                for (const socket of sockets) socket.destroy();
                server.close(() => {
                    rmSync(socketPath, { force: true });
                    resolve();
                });
            }),
    };
}
