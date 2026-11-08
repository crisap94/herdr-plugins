import { createConnection } from 'node:net';
import type { Socket } from 'node:net';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import { must } from '#src/protocol/result.ts';
import type { Duration } from '#src/recap/domain/time.ts';
import { parseText, type NonEmptyText, type Text } from '#src/recap/domain/text.ts';
import { unknown, type Unknown } from '#src/ports/unknowable.ts';
import {
    HC_BACKOFF_BASE, HC_BACKOFF_CAP, HC_CLOSED, HC_CONNECTING, HC_DOWN, HC_DROPPED, HC_GENERATION, HC_HELLO_METHOD,
    HC_HELLO_TIMEOUT, HC_HELLO_UNREADABLE, HC_NO_CONNECTION, HC_ODD_RESULT,
} from './desktop-constants.ts';
import { Backoff } from './hc-core-backoff.ts';
import { HcCoreLines, encodeHcCoreRequest, parseHcCallId, parseHcCoreHello, parseHcCoreMessage, parseHcParams, parseWireChunk } from './hc-core-wire.ts';
import type { HcCallId, HcCoreHello, HcCoreMessage, HcParams, HcPayload, SocketPath } from './hc-core-wire.ts';

export interface HcAnswered {
    readonly kind: 'answer';
    readonly value: HcPayload;
}

export type HcCallResult = HcAnswered | Unknown;

export interface CoreLinkTiming {
    readonly helloTimeout: Duration;
    readonly backoffBase: Duration;
    readonly backoffCap: Duration;
}

export interface CoreLinkParts {
    readonly path: SocketPath;
    readonly timing?: CoreLinkTiming;
}

type LinkState = 'idle' | 'connecting' | 'ready' | 'backoff' | 'closed';
type Settle = (result: HcCallResult) => void;

const ZERO = must(parseCount(0));
const ONE = must(parseCount(1));
const HELLO_PARAMS: HcParams = must(parseHcParams({ generation: HC_GENERATION }));
const DEFAULT_TIMING: CoreLinkTiming = { helloTimeout: HC_HELLO_TIMEOUT, backoffBase: HC_BACKOFF_BASE, backoffCap: HC_BACKOFF_CAP };

const unreachable = (detail: Text): Unknown => unknown({ why: 'unreachable', detail });

function answerOf(message: HcCoreMessage): HcCallResult | null {
    if (message.kind === 'reply') {
        return { kind: 'answer', value: message.result };
    }
    if (message.kind === 'odd') {
        return unknown({ why: 'unreadable', detail: HC_ODD_RESULT });
    }
    if (message.kind === 'fault') {
        return unknown({ why: 'failed', code: message.code, detail: `${message.reason}: ${message.message}` });
    }
    return null;
}

function idOf(message: HcCoreMessage): HcCallId | null {
    return message.kind === 'reply' || message.kind === 'fault' || message.kind === 'odd' ? message.id : null;
}

export class CoreLink {
    private readonly path: SocketPath;
    private readonly timing: CoreLinkTiming;
    private readonly pending = new Map<HcCallId, Settle>();
    private socket: Socket | null = null;
    private state: LinkState = 'idle';
    private connecting: Promise<Unknown | null> | null = null;
    private readonly backoff: Backoff;
    private issued: Count = ZERO;
    private info: HcCoreHello | null = null;

    constructor(parts: CoreLinkParts) {
        this.path = parts.path;
        this.timing = parts.timing ?? DEFAULT_TIMING;
        this.backoff = new Backoff(this.timing, 'lets-process-end');
    }

    get hello(): HcCoreHello | null {
        return this.info;
    }

    open(): Promise<Unknown | null> {
        return this.ready();
    }

    call(method: NonEmptyText, params: HcParams, timeout: Duration): Promise<HcCallResult> {
        return new Promise<HcCallResult>((resolve) => {
            const timer = setTimeout(() => { resolve(unknown({ why: 'timeout', after: timeout })); }, timeout);
            timer.unref();
            void this.attempt(method, params, timeout).then((result) => {
                clearTimeout(timer);
                resolve(result);
                return result;
            });
        });
    }

    private async attempt(method: NonEmptyText, params: HcParams, timeout: Duration): Promise<HcCallResult> {
        const down = await this.ready();
        return down === null ? this.request(method, params, timeout) : down;
    }

    async close(): Promise<void> {
        this.state = 'closed';
        this.backoff.stop();
        this.settleAll(unreachable(HC_CLOSED));
        const socket = this.socket;
        if (socket === null) {
            return;
        }
        this.socket = null;
        await new Promise<void>((resolve) => { socket.once('close', () => { resolve(); }); socket.destroy(); });
    }

    private ready(): Promise<Unknown | null> {
        switch (this.state) {
            case 'ready':
                return Promise.resolve(null);
            case 'connecting':
                return this.connecting ?? Promise.resolve(unreachable(HC_CONNECTING));
            case 'backoff':
                return Promise.resolve(unreachable(HC_DOWN));
            case 'closed':
                return Promise.resolve(unreachable(HC_CLOSED));
            default:
                return this.connect();
        }
    }

    private connect(): Promise<Unknown | null> {
        this.state = 'connecting';
        const attempt = this.dial().finally(() => { this.connecting = null; });
        this.connecting = attempt;
        return attempt;
    }

    private dial(): Promise<Unknown | null> {
        return new Promise<Unknown | null>((resolve) => {
            const socket = createConnection(this.path);
            const lines = new HcCoreLines(() => { socket.destroy(); });
            let reason: Text = HC_DROPPED;
            this.socket = socket;
            socket.on('data', (chunk) => {
                const bytes = parseWireChunk(chunk);
                if (bytes.kind === 'ok') {
                    this.receive(lines.feed(bytes.value));
                }
            });
            socket.on('error', (cause) => { reason = must(parseText(cause.message)); });
            socket.on('close', () => { this.lost(socket); resolve(unreachable(reason)); });
            socket.once('connect', () => { void this.handshake(socket).then(resolve); });
        });
    }

    private async handshake(socket: Socket): Promise<Unknown | null> {
        const reply = await this.request(HC_HELLO_METHOD, HELLO_PARAMS, this.timing.helloTimeout);
        const refusal = this.takeHello(reply);
        if (refusal !== null) {
            socket.destroy();
            return refusal;
        }
        this.state = 'ready';
        this.backoff.survive();
        return null;
    }

    private takeHello(reply: HcCallResult): Unknown | null {
        if (reply.kind === 'unknown') {
            return reply;
        }
        const hello = parseHcCoreHello(reply.value);
        if (hello.kind === 'err') {
            return unknown({ why: 'unreadable', detail: HC_HELLO_UNREADABLE });
        }
        if (hello.value.generation !== HC_GENERATION) {
            return unknown({ why: 'unreadable', detail: `generation ${hello.value.generation}` });
        }
        this.info = hello.value;
        return null;
    }

    private request(method: NonEmptyText, params: HcParams, timeout: Duration): Promise<HcCallResult> {
        const socket = this.socket;
        if (socket === null || socket.destroyed) {
            return Promise.resolve(unreachable(HC_NO_CONNECTION));
        }
        this.issued = must(parseCount(this.issued + ONE));
        const id = must(parseHcCallId(this.issued));
        return new Promise<HcCallResult>((resolve) => {
            const timer = setTimeout(() => { this.pending.delete(id); resolve(unknown({ why: 'timeout', after: timeout })); }, timeout);
            timer.unref();
            this.pending.set(id, (result) => { clearTimeout(timer); resolve(result); });
            socket.write(encodeHcCoreRequest(id, method, params));
        });
    }

    private receive(values: readonly HcPayload[]): void {
        for (const value of values) {
            const parsed = parseHcCoreMessage(value);
            const id = parsed.kind === 'ok' ? idOf(parsed.value) : null;
            const answer = parsed.kind === 'ok' ? answerOf(parsed.value) : null;
            const settle = id === null ? undefined : this.pending.get(id);
            if (id !== null && settle !== undefined && answer !== null) {
                this.pending.delete(id);
                settle(answer);
            }
        }
    }

    private lost(socket: Socket): void {
        if (socket !== this.socket) {
            return;
        }
        this.socket = null;
        this.settleAll(unreachable(HC_DROPPED));
        if (this.state === 'closed') {
            return;
        }
        this.state = 'backoff';
        this.backoff.schedule(() => { void this.reconnect(); });
    }

    private reconnect(): Promise<Unknown | null> {
        return this.state === 'backoff' ? this.connect() : Promise.resolve(null);
    }

    private settleAll(result: Unknown): void {
        const settles = [...this.pending.values()];
        this.pending.clear();
        for (const settle of settles) {
            settle(result);
        }
    }
}
