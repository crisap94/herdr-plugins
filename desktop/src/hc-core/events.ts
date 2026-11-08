import { createConnection } from 'node:net';
import type { Socket } from 'node:net';
import { must } from '../kernel/result.ts';
import { AsyncQueue } from '../kernel/async-queue.ts';
import { duration, type Duration } from '../kernel/time.ts';
import { Backoff } from './backoff.ts';
import { HC_BACKOFF_BASE, HC_BACKOFF_CAP, HC_HEARTBEAT_EVERY, HC_HEARTBEAT_MISSES, HC_SUBSCRIBE_METHOD } from './constants.ts';
import { HcCoreLines, encodeHcCoreRequest, parseHcCallId, parseHcCoreMessage, parseHcParams, parseHcSnapshot, parseWireChunk } from './wire.ts';
import type { HcCoreMessage, HcEvent, HcHeartbeat, HcMissed, HcParams, HcPayload, HcSnapshot, SocketPath } from './wire.ts';

export interface HcSnapshotFeed {
    readonly kind: 'snapshot';
    readonly snapshot: HcSnapshot;
}

export type HcCoreFeed = HcSnapshotFeed | HcMissed | HcHeartbeat | HcEvent;

export interface CoreEventsTiming {
    readonly backoffBase: Duration;
    readonly backoffCap: Duration;
    readonly silence: Duration;
}

export interface CoreEventsParts {
    readonly path: SocketPath;
    readonly filter?: HcParams;
    readonly timing?: CoreEventsTiming;
}

type Phase = 'waiting' | 'subscribed';
type Life = 'open' | 'closed';

const SUBSCRIBE_ID = must(parseHcCallId(1));
const NO_FILTER: HcParams = must(parseHcParams({}));
const DEFAULT_TIMING: CoreEventsTiming = {
    backoffBase: HC_BACKOFF_BASE,
    backoffCap: HC_BACKOFF_CAP,
    silence: duration(HC_HEARTBEAT_EVERY * HC_HEARTBEAT_MISSES),
};

function feedOf(message: HcCoreMessage): HcCoreFeed | null {
    return message.kind === 'missed' || message.kind === 'heartbeat' || message.kind === 'event' ? message : null;
}

export class CoreEvents {
    readonly feed = new AsyncQueue<HcCoreFeed>();
    private readonly path: SocketPath;
    private readonly filter: HcParams;
    private readonly timing: CoreEventsTiming;
    private socket: Socket | null = null;
    private watchdog: NodeJS.Timeout | null = null;
    private readonly backoff: Backoff;
    private phase: Phase = 'waiting';
    private life: Life = 'open';

    constructor(parts: CoreEventsParts) {
        this.path = parts.path;
        this.filter = parts.filter ?? NO_FILTER;
        this.timing = parts.timing ?? DEFAULT_TIMING;
        this.backoff = new Backoff(this.timing, 'holds-process');
    }

    start(): void {
        if (this.socket === null && this.backoff.phase === 'idle' && this.life === 'open') {
            this.connect();
        }
    }

    async close(): Promise<void> {
        this.life = 'closed';
        this.clearTimers();
        this.feed.end();
        const socket = this.socket;
        if (socket === null) {
            return;
        }
        this.socket = null;
        await new Promise<void>((resolve) => { socket.once('close', () => { resolve(); }); socket.destroy(); });
    }

    private connect(): void {
        const socket = createConnection(this.path);
        const lines = new HcCoreLines(() => { socket.destroy(); });
        this.socket = socket;
        this.phase = 'waiting';
        socket.on('data', (chunk) => {
            const bytes = parseWireChunk(chunk);
            this.arm(socket);
            if (bytes.kind === 'ok') {
                this.receive(lines.feed(bytes.value), socket);
            }
        });
        socket.on('error', () => undefined);
        socket.on('close', () => { this.lost(socket); });
        socket.once('connect', () => {
            this.arm(socket);
            socket.write(encodeHcCoreRequest(SUBSCRIBE_ID, HC_SUBSCRIBE_METHOD, this.filter));
        });
    }

    private arm(socket: Socket): void {
        if (this.watchdog !== null) {
            clearTimeout(this.watchdog);
        }
        this.watchdog = setTimeout(() => { socket.destroy(); }, this.timing.silence);
        this.watchdog.unref();
    }

    private receive(values: readonly HcPayload[], socket: Socket): void {
        for (const value of values) {
            const parsed = parseHcCoreMessage(value);
            if (parsed.kind === 'err') {
                continue;
            }
            this.accept(parsed.value, socket);
        }
    }

    private accept(message: HcCoreMessage, socket: Socket): void {
        if (message.kind === 'fault' || message.kind === 'odd') {
            socket.destroy();
            return;
        }
        if (message.kind === 'reply') {
            this.snapshotOf(message.result, socket);
            return;
        }
        const feed = this.phase === 'subscribed' ? feedOf(message) : null;
        if (feed !== null) {
            this.feed.push(feed);
        }
    }

    private snapshotOf(result: HcPayload, socket: Socket): void {
        const snapshot = parseHcSnapshot(result);
        if (snapshot.kind === 'err' || this.phase === 'subscribed') {
            socket.destroy();
            return;
        }
        this.phase = 'subscribed';
        this.backoff.survive();
        this.feed.push({ kind: 'snapshot', snapshot: snapshot.value });
    }

    private lost(socket: Socket): void {
        if (socket !== this.socket) {
            return;
        }
        this.socket = null;
        this.clearTimers();
        if (this.life === 'closed') {
            return;
        }
        this.backoff.schedule(() => { this.connect(); });
    }

    private clearTimers(): void {
        if (this.watchdog !== null) {
            clearTimeout(this.watchdog);
        }
        this.watchdog = null;
        this.backoff.stop();
    }
}
