import { createConnection } from 'node:net';
import type { Socket } from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

export type Json = Readonly<Record<string, unknown>>;

export function socketPath(): string {
    const given = process.env['HERDR_SOCKET_PATH'];
    return given !== undefined && given !== '' ? given : join(homedir(), '.config', 'herdr', 'herdr.sock');
}

export class HerdrError extends Error {
    override readonly name = 'HerdrError';
    readonly code: string;

    constructor(method: string, code: string, message: string) {
        super(`${method}: ${message} [${code}]`);
        this.code = code;
    }
}

let sequence = 0;
const nextId = (prefix: string): string => `tab-recap:${prefix}:${process.pid}:${++sequence}`;

function asJson(line: string): Json | null {
    try {
        const parsed: unknown = JSON.parse(line);
        return typeof parsed === 'object' && parsed !== null ? (parsed as Json) : null;
    } catch {
        return null;
    }
}

function onLines(sock: Socket, handle: (message: Json) => void): void {
    const lines = createInterface({ input: sock, crlfDelay: Infinity });
    lines.on('error', () => undefined);
    lines.on('line', (line) => {
        const message = asJson(line);
        if (message !== null) {
            handle(message);
        }
    });
}

const isReplyTo = (message: Json, id: string): boolean => message['id'] === id || message['id'] === '';

function errorOf(method: string, message: Json): HerdrError | null {
    const error = message['error'];
    if (typeof error !== 'object' || error === null) {
        return null;
    }
    const fields = error as Json;
    const code = fields['code'];
    const text = fields['message'];
    return new HerdrError(method, typeof code === 'string' ? code : '?', typeof text === 'string' ? text : '');
}

export function rpc(method: string, params: Json, timeoutMs = 10_000): Promise<Json> {
    return new Promise<Json>((resolve, reject) => {
        const id = nextId('rpc');
        const sock = createConnection({ path: socketPath() });
        let settled = false;
        const settle = (finish: () => void): void => {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timer);
            sock.destroy();
            finish();
        };
        const timer = setTimeout(() => { settle(() => { reject(new Error(`${method}: no reply in ${timeoutMs} ms`)); }); }, timeoutMs);
        onLines(sock, (message) => {
            if (!isReplyTo(message, id)) {
                return;
            }
            const error = errorOf(method, message);
            const result = message['result'];
            settle(() => (error === null ? resolve(typeof result === 'object' && result !== null ? (result as Json) : {}) : reject(error)));
        });
        sock.on('connect', () => { sock.write(`${JSON.stringify({ id, method, params })}\n`); });
        sock.on('error', (error) => { settle(() => { reject(error); }); });
        sock.on('close', () => { settle(() => { reject(new Error(`${method}: connection closed`)); }); });
    });
}

export interface Pushed {
    readonly event: string;
    readonly data: Json;
}

export interface Live {
    close(): void;
}

export const ACK_TIMEOUT_MS = 10_000;

export function subscribe(topics: readonly Json[], onPush: (pushed: Pushed) => void, onEnd: () => void, ackTimeoutMs = ACK_TIMEOUT_MS): Promise<Live> {
    return new Promise<Live>((resolve, reject) => {
        const id = nextId('sub');
        const sock = createConnection({ path: socketPath() });
        let acked = false;
        let closing = false;
        const timer = setTimeout(() => {
            if (!acked) {
                reject(new Error(`events.subscribe: no ack in ${ackTimeoutMs} ms`));
                sock.destroy();
            }
        }, ackTimeoutMs);
        onLines(sock, (message) => {
            if (acked) {
                const event = message['event'];
                const data = message['data'];
                if (typeof event === 'string') {
                    onPush({ event, data: typeof data === 'object' && data !== null ? (data as Json) : {} });
                }
                return;
            }
            if (!isReplyTo(message, id)) {
                return;
            }
            const error = errorOf('events.subscribe', message);
            if (error !== null) {
                clearTimeout(timer);
                sock.destroy();
                reject(error);
                return;
            }
            acked = true;
            clearTimeout(timer);
            resolve({ close: (): void => { closing = true; sock.destroy(); } });
        });
        sock.on('connect', () => {
            sock.write(`${JSON.stringify({ id, method: 'events.subscribe', params: { subscriptions: topics } })}\n`);
        });
        sock.on('error', (error) => { if (!acked) { clearTimeout(timer); reject(error); } });
        sock.on('close', () => {
            clearTimeout(timer);
            if (!acked) {
                reject(new Error('events.subscribe: closed before the ack'));
            } else if (!closing) {
                onEnd();
            }
        });
    });
}
