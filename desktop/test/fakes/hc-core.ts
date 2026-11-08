import { createServer } from 'node:net';
import type { Server, Socket } from 'node:net';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brand } from '../../src/kernel/brand.ts';
import type { SocketPath } from '../../src/hc-core/wire.ts';

type Fields = Record<string, unknown>;
export type Handler = (params: Fields) => unknown;

export class FakeFault {
    readonly code: number;
    readonly kind: string;
    readonly message: string;

    constructor(code: number, kind: string, message: string) {
        this.code = code;
        this.kind = kind;
        this.message = message;
    }
}

export interface Seen {
    readonly method: string;
    readonly params: Fields;
    readonly connection: number;
}

const isFields = (input: unknown): input is Fields => typeof input === 'object' && input !== null && !Array.isArray(input);
const loaded: unknown = JSON.parse(readFileSync(join(import.meta.dirname, '../fixtures/hc-core-frames.json'), 'utf8'));

export function frame(name: string): Fields {
    const found = isFields(loaded) ? loaded[name] : undefined;
    if (!isFields(found)) {
        throw new Error(`no scripted frame ${name}`);
    }
    return found;
}

const section = (source: Fields, key: string): Fields => {
    const found = source[key];
    return isFields(found) ? found : {};
};

const listOf = (source: Fields, key: string): unknown[] => {
    const found = source[key];
    return Array.isArray(found) ? found : [];
};

const dataOf = (name: string): Fields => section(section(frame(name), 'params'), 'data');

export const agentTerminal = (address: string, state: string, labels: Fields = { 'herdr.tab': 'tb1', 'herdr.space': 'sp1', where: 'S / 1' }): Fields => ({
    ...dataOf('event:created'), address, labels, state: 'live', status: { app: 'claude-code', state }, foreground: { argv: ['claude'], cwd: '~/work/probe', name: 'claude', pid: 4242 },
});

export const shellTerminal = (address: string): Fields => {
    const first = listOf(section(frame('subscribed'), 'result'), 'terminals')[0];
    return { ...(isFields(first) ? first : {}), address };
};

export class FakeHcCore {
    connections = 0;
    silent = false;
    splitReplies = false;
    seq = 100;
    terminals: Fields[] = [];
    readonly seen: Seen[] = [];
    private readonly handlers = new Map<string, Handler>();
    private readonly delays = new Map<string, number>();
    private readonly sockets = new Set<Socket>();
    private readonly subscribers = new Set<Socket>();
    private readonly timers = new Set<NodeJS.Timeout>();
    private server: Server | null = null;
    private helloResult: Fields = section(frame('hello'), 'result');

    private readonly dir: string;
    readonly path: SocketPath;

    private constructor(dir: string, path: SocketPath) {
        this.dir = dir;
        this.path = path;
        this.terminals = [agentTerminal('t1', 'working'), agentTerminal('t2', 'idle')];
    }

    static async start(): Promise<FakeHcCore> {
        const dir = mkdtempSync(join(tmpdir(), 'tab-recap-core-'));
        const core = new FakeHcCore(dir, brand<string, 'SocketPath'>(join(dir, 'default.sock')));
        await core.up();
        return core;
    }

    static unlistened(): FakeHcCore {
        const dir = mkdtempSync(join(tmpdir(), 'tab-recap-core-'));
        return new FakeHcCore(dir, brand<string, 'SocketPath'>(join(dir, 'default.sock')));
    }

    get open(): number {
        return this.sockets.size;
    }

    get subscribed(): number {
        return this.subscribers.size;
    }

    on(method: string, handler: Handler): void {
        this.handlers.set(method, handler);
    }

    delay(method: string, ms: number): void {
        this.delays.set(method, ms);
    }

    hello(patch: Fields): void {
        this.helloResult = { ...this.helloResult, ...patch };
    }

    async up(): Promise<void> {
        const server = createServer((socket) => { this.accept(socket); });
        this.server = server;
        await new Promise<void>((resolve) => { server.listen(this.path, resolve); });
    }

    async down(): Promise<void> {
        const server = this.server;
        this.server = null;
        this.dropAll();
        if (server !== null) {
            await new Promise<void>((resolve) => { server.close(() => { resolve(); }); });
        }
    }

    dropAll(): void {
        for (const socket of this.sockets) {
            socket.destroy();
        }
    }

    event(type: string, terminal: string | null, data?: Fields): number {
        this.seq += 1;
        const base = section(frame(`event:${type}`), 'params');
        this.send({ jsonrpc: '2.0', method: 'event', params: { seq: this.seq, terminal, type, data: data ?? section(base, 'data') } });
        return this.seq;
    }

    heartbeat(): void {
        this.send({ jsonrpc: '2.0', method: 'heartbeat', params: { seq: this.seq } });
    }

    missed(terminals: Fields[]): void {
        this.seq += 1;
        this.send({ jsonrpc: '2.0', method: 'missed', params: { seq: this.seq, terminals } });
    }

    raw(text: string): void {
        for (const socket of this.subscribers) {
            socket.write(text);
        }
    }

    async stop(): Promise<void> {
        for (const timer of this.timers) {
            clearTimeout(timer);
        }
        await this.down();
        rmSync(this.dir, { recursive: true, force: true });
    }

    private send(message: Fields): void {
        const line = `${JSON.stringify(message)}\n`;
        for (const socket of this.subscribers) {
            socket.write(line);
        }
    }

    private accept(socket: Socket): void {
        this.connections += 1;
        const connection = this.connections;
        this.sockets.add(socket);
        let rest = '';
        socket.on('data', (chunk: Buffer) => {
            const lines = (rest + chunk.toString('utf8')).split('\n');
            rest = lines.pop() ?? '';
            for (const line of lines) {
                this.handle(socket, line, connection);
            }
        });
        socket.on('error', () => undefined);
        socket.on('close', () => { this.sockets.delete(socket); this.subscribers.delete(socket); });
    }

    private handle(socket: Socket, line: string, connection: number): void {
        const request: unknown = JSON.parse(line);
        if (!isFields(request) || typeof request['method'] !== 'string') {
            return;
        }
        const method = request['method'];
        const params = section(request, 'params');
        this.seen.push({ method, params, connection });
        if (this.silent) {
            return;
        }
        const wait = this.delays.get(method) ?? 0;
        const timer = setTimeout(() => { this.timers.delete(timer); this.reply(socket, request['id'], method, params); }, wait);
        this.timers.add(timer);
    }

    private reply(socket: Socket, id: unknown, method: string, params: Fields): void {
        if (socket.destroyed) {
            return;
        }
        const body = this.outcome(socket, method, params);
        const line = `${JSON.stringify({ id, jsonrpc: '2.0', ...body })}\n`;
        if (!this.splitReplies) {
            socket.write(line);
            return;
        }
        socket.write(line.slice(0, 7));
        const timer = setTimeout(() => { this.timers.delete(timer); socket.write(line.slice(7)); }, 15);
        this.timers.add(timer);
    }

    private outcome(socket: Socket, method: string, params: Fields): Fields {
        try {
            return { result: this.resultOf(socket, method, params) };
        } catch (cause) {
            if (cause instanceof FakeFault) {
                return { error: { code: cause.code, message: cause.message, data: { kind: cause.kind } } };
            }
            throw cause;
        }
    }

    private resultOf(socket: Socket, method: string, params: Fields): unknown {
        const custom = this.handlers.get(method);
        if (custom !== undefined) {
            return custom(params);
        }
        switch (method) {
            case 'hello':
                return this.helloResult;
            case 'terminal.list':
                return { hidden_finished: 0, terminals: this.terminals };
            case 'terminal.get':
                return this.getOf(params['terminal']);
            case 'terminal.read':
                return { text: `screen of ${String(params['terminal'])}`, complete: true, how: 'screen', why: null };
            case 'events.subscribe':
                this.subscribers.add(socket);
                return { channel: null, seq: this.seq, terminals: this.terminals };
            default:
                throw new FakeFault(-32601, 'method_not_found', `no method ${method}`);
        }
    }

    private getOf(address: unknown): Fields {
        const found = this.terminals.find((terminal) => terminal['address'] === address);
        if (found === undefined) {
            throw new FakeFault(-32000, 'not_found', `no terminal "${String(address)}"`);
        }
        return found;
    }
}

export function nextWithin<T>(iterator: AsyncIterator<T>, ms: number): Promise<T | null> {
    return new Promise<T | null>((resolve, reject) => {
        const timer = setTimeout(() => { resolve(null); }, ms);
        iterator.next().then((step) => { clearTimeout(timer); resolve(step.done === true ? null : step.value); return step; }, reject);
    });
}

export const later = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms); });
