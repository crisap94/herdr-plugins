import { readFileSync } from 'node:fs';
import { createConnection, createServer } from 'node:net';
import type { Server, Socket } from 'node:net';
import { basename } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { LineSplitter, decodeClient, decodeDaemon } from '#src/wire/view/codec.ts';
import { initialConn, step } from '#src/wire/view/connection.ts';
import type { Conn, ConnEvent, ConnState, Effect, Facts } from '#src/wire/view/connection.ts';
import { intentOf } from '#src/wire/view/keys.ts';
import { TIMING } from '#src/wire/view/protocol.ts';
import type { Role } from '#src/wire/view/protocol.ts';
import { fixtureIntents } from './fixture-render.ts';

export interface Clock { now(): number; advance(ms: number): void }

export interface Settings {
    readonly daemonVersion: string;
    readonly paneVersion: string;
    readonly diskVersion: string;
    readonly daemonProtocol: number;
    readonly role: Role;
    readonly tab: string;
    readonly rolledFor: string | null;
}

export type Item =
    | { readonly line: number; readonly kind: 'C' | 'D'; readonly text: string }
    | { readonly line: number; readonly kind: 'open' }
    | { readonly line: number; readonly kind: 'close'; readonly side: 'daemon' | 'pane' }
    | { readonly line: number; readonly kind: 'state'; readonly state: ConnState }
    | { readonly line: number; readonly kind: 'intent' | 'effect'; readonly word: string }
    | { readonly line: number; readonly kind: 'wait'; readonly ms: number };

export interface Transcript { readonly name: string; readonly settings: Settings; readonly items: readonly Item[] }

export interface Mismatch { readonly line: number; readonly expected: string; readonly actual: string }

export interface Peer { readonly socket: Socket; next(waitMs?: number | null): Promise<string | null>; closed(): Promise<boolean>; write(text: string): void }

export const WAIT_MS = 2000;

export const DEFAULT_SETTINGS: Settings = {
    daemonVersion: '9.9.9',
    paneVersion: '9.9.9',
    diskVersion: '9.9.9',
    daemonProtocol: 1,
    role: 'column',
    tab: 't1',
    rolledFor: null,
};

const ROLES: ReadonlySet<string> = new Set(['column', 'modal', 'bar']);
const STATES: ReadonlySet<string> = new Set(['connecting', 'connected', 'daemon-down', 'version-mismatch']);
const CLOSED = '<closed>';

const isRole = (value: string): value is Role => ROLES.has(value);

const isState = (value: string): value is ConnState => STATES.has(value);

type Setter = (value: string) => Partial<Settings> | null;

const SETTERS: ReadonlyMap<string, Setter> = new Map<string, Setter>([
    ['daemon-version', (value: string): Partial<Settings> => ({ daemonVersion: value })],
    ['pane-version', (value: string): Partial<Settings> => ({ paneVersion: value })],
    ['disk-version', (value: string): Partial<Settings> => ({ diskVersion: value })],
    ['daemon-protocol', (value: string): Partial<Settings> => ({ daemonProtocol: Number(value) })],
    ['role', (value: string): Partial<Settings> | null => (isRole(value) ? { role: value } : null)],
    ['tab', (value: string): Partial<Settings> => ({ tab: value })],
    ['rolled-for', (value: string): Partial<Settings> => ({ rolledFor: value })],
]);

type Parse = (line: number, word: string) => Item | null;

const BANGS: ReadonlyMap<string, Parse> = new Map<string, Parse>([
    ['open', (line: number, word: string): Item | null => (word === '' ? { line, kind: 'open' } : null)],
    ['close', (line: number, word: string): Item | null => (word === 'daemon' || word === 'pane' ? { line, kind: 'close', side: word } : null)],
    ['state', (line: number, word: string): Item | null => (isState(word) ? { line, kind: 'state', state: word } : null)],
    ['intent', (line: number, word: string): Item | null => (word === '' ? null : { line, kind: 'intent', word })],
    ['effect', (line: number, word: string): Item | null => (word === '' ? null : { line, kind: 'effect', word })],
    ['wait', (line: number, word: string): Item | null => (/^\d+$/u.test(word) ? { line, kind: 'wait', ms: Number(word) } : null)],
]);

const withSetting = (settings: Settings, rest: string, line: number): Settings => {
    const [name = '', value = '', ...extra] = rest.split(' ');
    const change = value === '' || extra.length > 0 ? null : (SETTERS.get(name)?.(value) ?? null);
    if (change === null) {
        throw new Error(`line ${line}: not a setting: @ ${rest}`);
    }
    return { ...settings, ...change };
};

const itemOf = (raw: string, line: number): Item => {
    const head = raw.slice(0, 2);
    if (head === 'C ' || head === 'D ') {
        return { line, kind: head === 'C ' ? 'C' : 'D', text: raw.slice(2) };
    }
    const [bang, verb = '', ...words] = raw.split(' ');
    const parse = bang === '!' ? BANGS.get(verb) : undefined;
    const item = parse === undefined ? null : parse(line, words.join(' '));
    if (item === null) {
        throw new Error(`line ${line}: not a transcript line: ${raw}`);
    }
    return item;
};

export function readTranscript(path: string): Transcript {
    let settings = DEFAULT_SETTINGS;
    const items: Item[] = [];
    readFileSync(path, 'utf8').split('\n').forEach((raw, index) => {
        const line = index + 1;
        if (raw === '' || raw.startsWith('# ')) {
            return;
        }
        if (raw.startsWith('@ ')) {
            settings = withSetting(settings, raw.slice(2), line);
            return;
        }
        items.push(itemOf(raw, line));
    });
    return { name: basename(path, '.transcript'), settings, items };
}

export function fakeClock(start = 0): Clock {
    let current = start;
    return {
        now: (): number => current,
        advance: (ms: number): void => {
            current += ms;
        },
    };
}

class Signal {
    private readonly waiters: (() => void)[] = [];

    wake(): void {
        for (const waiter of this.waiters.splice(0)) {
            waiter();
        }
    }

    until(ready: () => boolean, waitMs: number | null = WAIT_MS): Promise<boolean> {
        return new Promise((resolve) => {
            const timer = waitMs === null ? undefined : setTimeout(() => {
                resolve(false);
            }, waitMs);
            const check = (): void => {
                if (ready()) {
                    clearTimeout(timer);
                    resolve(true);
                    return;
                }
                this.waiters.push(check);
            };
            check();
        });
    }
}

export function peerOf(socket: Socket): Peer {
    const splitter = new LineSplitter();
    const signal = new Signal();
    const lines: string[] = [];
    let ended = false;
    socket.on('data', (chunk: Buffer) => {
        lines.push(...splitter.push(chunk).map((part) => (typeof part === 'string' ? part : JSON.stringify(part))));
        signal.wake();
    });
    socket.on('error', () => undefined);
    socket.on('close', () => {
        ended = true;
        signal.wake();
    });
    return {
        socket,
        next: async (waitMs: number | null = WAIT_MS): Promise<string | null> => ((await signal.until(() => lines.length > 0 || ended, waitMs)) ? (lines.shift() ?? null) : null),
        closed: (): Promise<boolean> => signal.until(() => ended),
        write: (text: string): void => {
            socket.write(text);
        },
    };
}

const attempt = (socketPath: string): Promise<Socket | null> =>
    new Promise((resolve) => {
        const socket = createConnection(socketPath);
        socket.once('connect', () => {
            resolve(socket);
        });
        socket.once('error', () => {
            socket.destroy();
            resolve(null);
        });
    });

export async function connectTo(socketPath: string): Promise<Socket> {
    const until = Date.now() + WAIT_MS;
    for (;;) {
        const socket = await attempt(socketPath);
        if (socket !== null) {
            return socket;
        }
        if (Date.now() > until) {
            throw new Error(`nothing listens at ${socketPath}`);
        }
        await delay(10);
    }
}

class PanePlayer {
    readonly mismatches: Mismatch[] = [];

    private conn: Conn = initialConn;

    private effects: Effect['kind'][] = [];

    private peer: Peer | null = null;

    private settled = false;

    private pingAt: number | null = null;

    private readonly settings: Settings;

    private readonly socketPath: string;

    private readonly clock: Clock;

    constructor(settings: Settings, socketPath: string, clock: Clock) {
        this.settings = settings;
        this.socketPath = socketPath;
        this.clock = clock;
    }

    async play(item: Item): Promise<void> {
        switch (item.kind) {
            case 'open': return this.open();
            case 'C': return this.send(item.text);
            case 'D': return this.expect(item.line, item.text);
            case 'close': return item.side === 'pane' ? this.hangUp() : this.dropped(item.line);
            case 'state': return this.check(item.line, item.state, this.conn.state);
            case 'effect': return this.effect(item.line, item.word);
            case 'wait': return this.wait(item.ms);
            default: return undefined;
        }
    }

    finish(): void {
        this.peer?.socket.end();
    }

    private facts(): Facts {
        const { settings } = this;
        return { now: this.clock.now(), role: settings.role, ownVersion: settings.paneVersion, diskVersion: settings.diskVersion, rolledFor: settings.rolledFor, canExec: true };
    }

    private apply(event: ConnEvent): void {
        const result = step(this.conn, event, this.facts());
        this.conn = result.conn;
        this.effects.push(...result.effects.map((effect) => effect.kind));
    }

    private async open(): Promise<void> {
        this.peer = peerOf(await connectTo(this.socketPath));
        this.settled = false;
        this.pingAt = null;
    }

    private send(text: string): void {
        this.peer?.write(`${text}\n`);
        const message = decodeClient(text);
        if (!('kind' in message) && message.t === 'ping') {
            this.pingAt = this.clock.now();
        }
    }

    private async expect(line: number, text: string): Promise<void> {
        const actual = (await this.peer?.next()) ?? CLOSED;
        this.check(line, text, actual);
        if (actual === text) {
            this.heard(text);
        }
    }

    private heard(text: string): void {
        const message = decodeDaemon(text);
        if ('kind' in message) {
            return;
        }
        if (message.t === 'welcome' || message.t === 'bye') {
            this.settled = message.t === 'bye';
            this.apply(message.t === 'welcome' ? { kind: 'welcome', protocol: message.protocol, version: message.version } : { kind: 'bye', why: message.why, protocol: message.protocol, version: message.version });
            return;
        }
        this.conn = message.t === 'frame' ? { ...this.conn, hasFrame: true } : this.conn;
        this.pingAt = message.t === 'pong' ? null : this.pingAt;
    }

    private hangUp(): void {
        this.peer?.socket.end();
    }

    private async dropped(line: number): Promise<void> {
        const closed = (await this.peer?.closed()) ?? false;
        this.check(line, CLOSED, closed ? CLOSED : 'open');
        if (!this.settled) {
            this.settled = true;
            this.apply({ kind: 'lost' });
        }
    }

    private effect(line: number, word: string): void {
        this.check(line, word, this.effects.includes(word as Effect['kind']) ? word : `[${this.effects.join(',')}]`);
        this.effects = [];
    }

    private wait(ms: number): void {
        this.clock.advance(ms);
        if (this.pingAt !== null && this.clock.now() - this.pingAt >= TIMING.pongMs && !this.settled) {
            this.pingAt = null;
            this.settled = true;
            this.apply({ kind: 'lost' });
            this.hangUp();
        }
    }

    private check(line: number, expected: string, actual: string): void {
        if (expected !== actual) {
            this.mismatches.push({ line, expected, actual });
        }
    }
}

class DaemonPlayer {
    readonly mismatches: Mismatch[] = [];

    private readonly accepted: Peer[] = [];

    private readonly all: Peer[] = [];

    private readonly signal = new Signal();

    private readonly intents = fixtureIntents();

    private checked = 0;

    private peer: Peer | null = null;

    private role: Role;

    private readonly server: Server;

    private readonly settings: Settings;

    private readonly clock: Clock;

    constructor(server: Server, settings: Settings, clock: Clock) {
        this.server = server;
        this.settings = settings;
        this.clock = clock;
        this.role = settings.role;
        server.on('connection', (socket: Socket) => {
            const peer = peerOf(socket);
            this.accepted.push(peer);
            this.all.push(peer);
            this.signal.wake();
        });
    }

    async play(item: Item): Promise<void> {
        switch (item.kind) {
            case 'open': return this.open(item.line);
            case 'C': return this.expect(item.line, item.text);
            case 'D': return this.peer?.write(`${item.text}\n`);
            case 'close': return item.side === 'daemon' ? this.hangUp() : this.dropped(item.line);
            case 'intent': return this.intent(item.line, item.word);
            case 'wait': return this.clock.advance(item.ms);
            default: return undefined;
        }
    }

    async finish(last: number): Promise<void> {
        const extra = this.intents.seen.slice(this.checked).map((intent) => intent.kind);
        if (extra.length > 0) {
            this.mismatches.push({ line: last, expected: 'no further intent', actual: extra.join(',') });
        }
        for (const peer of this.all) {
            peer.socket.end();
        }
        await new Promise<void>((resolve) => {
            this.server.close(() => {
                resolve();
            });
        });
    }

    private async open(line: number): Promise<void> {
        const arrived = await this.signal.until(() => this.accepted.length > 0);
        this.peer = arrived ? (this.accepted.shift() ?? null) : null;
        this.role = this.settings.role;
        if (this.peer === null) {
            this.mismatches.push({ line, expected: 'a connection', actual: 'none' });
        }
    }

    private async expect(line: number, text: string): Promise<void> {
        const actual = (await this.peer?.next()) ?? CLOSED;
        if (actual !== text) {
            this.mismatches.push({ line, expected: text, actual });
            return;
        }
        const message = decodeClient(text);
        if ('kind' in message || message.t === 'ping' || message.t === 'resize') {
            return;
        }
        if (message.t === 'hello') {
            this.role = message.role;
            return;
        }
        const intent = intentOf(this.role, message);
        if (intent !== null) {
            this.intents.sink(intent);
        }
    }

    private hangUp(): void {
        this.peer?.socket.end();
    }

    private async dropped(line: number): Promise<void> {
        const closed = (await this.peer?.closed()) ?? false;
        if (!closed) {
            this.mismatches.push({ line, expected: CLOSED, actual: 'open' });
        }
    }

    private intent(line: number, word: string): void {
        const seen = this.intents.seen[this.checked]?.kind ?? 'none';
        this.checked += 1;
        if (seen !== word) {
            this.mismatches.push({ line, expected: word, actual: seen });
        }
    }
}

const lastLine = (t: Transcript): number => t.items.at(-1)?.line ?? 0;

export async function playAsPane(t: Transcript, socketPath: string, clock: Clock): Promise<Mismatch[]> {
    const player = new PanePlayer(t.settings, socketPath, clock);
    for (const item of t.items) {
        await player.play(item);
    }
    player.finish();
    return player.mismatches;
}

export async function playAsDaemon(t: Transcript, socketPath: string, clock: Clock): Promise<Mismatch[]> {
    const server = createServer();
    const player = new DaemonPlayer(server, t.settings, clock);
    await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(socketPath, () => {
            resolve();
        });
    });
    for (const item of t.items) {
        await player.play(item);
    }
    await player.finish(lastLine(t));
    return player.mismatches;
}
