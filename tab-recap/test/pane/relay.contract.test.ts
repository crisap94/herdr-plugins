import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import type { Socket } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BAR_TITLE, COLUMN_TITLE } from '#src/adapters/herdr/column-panes.ts';
import { xdgPaths } from '#src/adapters/os/config/paths-xdg.ts';
import { codeVersion } from '#src/adapters/os/plugin-version.ts';
import { stateDir } from '#src/daemon/config.ts';
import { relayEnvOf, titleOf } from '#src/pane/relay-env.ts';
import type { RelayEnv, RelayIo } from '#src/pane/relay-env.ts';
import { runRelay } from '#src/pane/relay.ts';
import { LineSplitter, decodeClient } from '#src/wire/view/codec.ts';
import type { ConnState } from '#src/wire/view/connection.ts';
import { ENTER, LEAVE, paintOf } from '#src/wire/view/paint.ts';
import { DEFAULT_TEXTS, PROTOCOL, TIMING } from '#src/wire/view/protocol.ts';
import type { ClientMessage, DaemonMessage, Hello } from '#src/wire/view/protocol.ts';
import { viewSocketPath } from '#src/wire/paths.ts';
import { startFakeViewDaemon } from '#test/contracts/wire/fakes/fake-view-daemon.ts';
import { WAIT_MS, fakeClock, playAsDaemon, readTranscript } from '#test/contracts/wire/fakes/transcript.ts';
import type { Item, Mismatch, Transcript } from '#test/contracts/wire/fakes/transcript.ts';

const ROOT = join(import.meta.dirname, '..', '..');
const urlOf = (directory: string): URL => pathToFileURL(`${directory}/`);
const FOLDER = fileURLToPath(new URL('../contracts/wire/fixtures/view/', import.meta.url));
const NAMES = readdirSync(FOLDER).filter((name) => name.endsWith('.transcript')).toSorted();
const CTRL_C = '\u0003';
const INJECTED = [
    'malformed.transcript this line is not json',
    'malformed.transcript {"t":"ping"}',
    'protocol-differs.transcript {"t":"hello","protocol":2,"version":"9.9.9","role":"column","tab":"t1","pane":null,"cols":40,"rows":6,"colour":false}',
    'unknown-type.transcript {"t":"zoom","level":2}',
];

interface Timer { readonly at: number; readonly ms: number; readonly f: () => void }

class Scheduler {
    private current = 0;

    private timers: Timer[] = [];

    now(): number {
        return this.current;
    }

    set(f: () => void, ms: number): Timer {
        const timer: Timer = { at: this.current + ms, ms, f };
        this.timers.push(timer);
        return timer;
    }

    clear(timer: Timer): void {
        this.timers = this.timers.filter((other) => other !== timer);
    }

    advance(ms: number): void {
        this.current += ms;
        for (let due = this.due(); due !== undefined; due = this.due()) {
            this.run(due);
        }
    }

    fire(ms: number): boolean {
        const timer = this.timers.find((other) => other.ms === ms);
        if (timer !== undefined) {
            this.run(timer);
        }
        return timer !== undefined;
    }

    private due(): Timer | undefined {
        return this.timers.filter((timer) => timer.at <= this.current).toSorted((a, b) => a.at - b.at)[0];
    }

    private run(timer: Timer): void {
        this.clear(timer);
        timer.f();
    }
}

class FakeSocket extends EventEmitter {
    private readonly onWrite: (text: string) => void;

    private readonly onDestroy: () => void;

    constructor(onWrite: (text: string) => void, onDestroy: () => void) {
        super();
        this.onWrite = onWrite;
        this.onDestroy = onDestroy;
    }

    write(text: string): boolean {
        this.onWrite(text);
        return true;
    }

    destroy(): this {
        this.onDestroy();
        return this;
    }
}

interface LinkRecord {
    readonly socket: Socket;
    readonly inbox: string[];
    readonly sent: string[];
    up: boolean;
    closed: boolean;
    closedByRelay: boolean;
    dropped: string | null;
    deliver(line: string): void;
    release(): void;
}

type Connect = (path: string) => Socket;

class Wire {
    readonly links: LinkRecord[] = [];

    private readonly foreignOpenings: ReadonlySet<number>;

    private readonly live: boolean;

    constructor(foreignOpenings: ReadonlySet<number>, live: boolean) {
        this.foreignOpenings = foreignOpenings;
        this.live = live;
    }

    readonly connect: Connect = (path: string): Socket => {
        const socket = createConnection(path);
        const dropsHello = this.foreignOpenings.has(this.links.length);
        const splitter = new LineSplitter();
        let released = this.live;
        const record: LinkRecord = {
            socket, inbox: [], sent: [], up: false, closed: false, closedByRelay: false, dropped: null,
            deliver: (line: string): void => { fake.emit('data', Buffer.from(`${line}\n`)); },
            release: (): void => {
                if (!released && record.closed) {
                    fake.emit('close');
                }
                released = true;
            },
        };
        const fake = new FakeSocket((text: string): void => {
            if (dropsHello && record.dropped === null && record.sent.length === 0) {
                record.dropped = text;
                return;
            }
            record.sent.push(text.trimEnd());
            socket.write(text);
        }, (): void => {
            record.closedByRelay = true;
            socket.destroy();
        });
        this.links.push(record);
        socket.once('connect', () => { record.up = true; fake.emit('connect'); });
        socket.on('data', (chunk: Buffer) => {
            const lines = splitter.push(chunk).filter((part) => typeof part === 'string');
            if (this.live) {
                lines.forEach((line) => { record.deliver(line); });
            } else {
                record.inbox.push(...lines);
            }
        });
        socket.on('error', () => undefined);
        socket.once('close', () => {
            record.closed = true;
            if (released) {
                fake.emit('close');
            }
        });
        return fake as unknown as Socket;
    };
}

interface FakeProcess {
    readonly io: RelayIo;
    readonly writes: string[];
    readonly effects: string[];
    readonly execs: NodeJS.ProcessEnv[];
    state(): ConnState;
    halted(): boolean;
    input(chunk: string): void;
    resize(cols: number, rows: number): void;
}

interface ProcessOptions { readonly connect: Connect; readonly scheduler: Scheduler; readonly cols: number; readonly rows: number; readonly colour: boolean; readonly exec: 'failed' | 'replaced' }

function fakeProcess(options: ProcessOptions): FakeProcess {
    const writes: string[] = [];
    const effects: string[] = [];
    const execs: NodeJS.ProcessEnv[] = [];
    let state: ConnState = 'connecting';
    let gone = false;
    const input = new EventEmitter();
    const out = Object.assign(new EventEmitter(), {
        columns: options.cols,
        rows: options.rows,
        write: (bytes: string): boolean => { writes.push(bytes); return true; },
    });
    const io: RelayIo = {
        connect: options.connect as unknown as RelayIo['connect'],
        out: out as unknown as RelayIo['out'],
        colour: { colour: options.colour },
        input: input as unknown as RelayIo['input'],
        setTimeout: ((f: () => void, ms: number) => options.scheduler.set(f, ms)) as unknown as RelayIo['setTimeout'],
        clearTimeout: ((timer: Timer) => { options.scheduler.clear(timer); }) as unknown as RelayIo['clearTimeout'],
        now: () => options.scheduler.now(),
        execve: ((_file: string, _args: readonly string[], env: NodeJS.ProcessEnv) => {
            execs.push(env);
            effects.push('reexec');
            if (options.exec === 'failed') {
                throw new Error('execve failed');
            }
            gone = true;
        }) as unknown as RelayIo['execve'],
        exit: (() => { effects.push('exit'); gone = true; }) as unknown as RelayIo['exit'],
        seen: (conn): void => { state = conn.state; },
    };
    return {
        io, writes, effects, execs,
        state: () => state,
        halted: () => gone,
        input: (chunk: string): void => { input.emit('data', Buffer.from(chunk)); },
        resize: (cols: number, rows: number): void => {
            out.columns = cols;
            out.rows = rows;
            out.emit('resize');
        },
    };
}

async function until(ready: () => boolean, waitMs: number = WAIT_MS): Promise<boolean> {
    const end = Date.now() + waitMs;
    while (!ready()) {
        if (Date.now() > end) {
            return false;
        }
        await delay(2);
    }
    return true;
}

const decodedHello = (text: string | undefined): Hello | null => {
    const message = text === undefined ? null : decodeClient(text);
    return message !== null && !('kind' in message) && message.t === 'hello' ? message : null;
};

const helloOf = (settings: Transcript['settings']): Hello => ({ t: 'hello', protocol: PROTOCOL, version: settings.paneVersion, role: settings.role, tab: settings.tab, pane: null, cols: 40, rows: 6, colour: false });

function isForeign(text: string, first: boolean): boolean {
    const message = decodeClient(text);
    if ('kind' in message) {
        return true;
    }
    if (message.t === 'hello') {
        return message.protocol !== PROTOCOL;
    }
    return first || message.t === 'intent';
}

function openingsOf(items: readonly Item[]): readonly (string | undefined)[] {
    const openings: (string | undefined)[] = [];
    let waiting = false;
    for (const item of items) {
        if (item.kind === 'open') {
            openings.push(undefined);
            waiting = true;
        } else if (item.kind === 'C' && waiting) {
            openings[openings.length - 1] = item.text;
            waiting = false;
        }
    }
    return openings;
}

interface Played { readonly mismatches: Mismatch[]; readonly injected: string[] }

class RelayPlayer {
    readonly played: Played = { mismatches: [], injected: [] };

    private readonly scheduler = new Scheduler();

    private readonly openings: readonly (string | undefined)[];

    private readonly wire: Wire;

    private proc: FakeProcess | null = null;

    private done: Promise<void> = Promise.resolve();

    private opened = 0;

    private cursor = 0;

    private readonly t: Transcript;

    private readonly directory: string;

    constructor(t: Transcript, directory: string) {
        this.t = t;
        this.directory = directory;
        this.openings = openingsOf(t.items);
        this.wire = new Wire(new Set(this.openings.flatMap((text, index) => (text !== undefined && isForeign(text, true) ? [index] : []))), false);
    }

    async play(item: Item): Promise<void> {
        switch (item.kind) {
            case 'D': return this.daemonSaid(item.line, item.text);
            case 'open': return this.open(item.line);
            case 'C': return this.client(item.line, item.text);
            case 'close': return this.closed(item.line, item.side);
            case 'state': return this.check(item.line, item.state, this.proc?.state() ?? 'none');
            case 'effect': return this.effect(item.line, item.word);
            case 'wait': return this.scheduler.advance(item.ms);
            default: return undefined;
        }
    }

    async finish(): Promise<void> {
        if (this.proc !== null && !this.proc.halted()) {
            this.proc.input(CTRL_C);
        }
        await this.done;
    }

    private link(): LinkRecord | undefined {
        return this.wire.links[this.opened - 1];
    }

    private start(): void {
        const hello = decodedHello(this.openings[this.opened - 1]) ?? helloOf(this.t.settings);
        const env: RelayEnv = {
            hello: { role: hello.role, tab: hello.tab, pane: hello.pane, version: hello.version },
            facts: { rolledFor: this.t.settings.rolledFor },
            stateDir: urlOf(this.directory),
            pluginRoot: urlOf(this.directory),
        };
        this.proc = fakeProcess({ connect: this.wire.connect, scheduler: this.scheduler, cols: hello.cols, rows: hello.rows, colour: hello.colour, exec: 'replaced' });
        this.done = runRelay(env, this.proc.io);
    }

    private async open(line: number): Promise<void> {
        this.opened += 1;
        this.cursor = 0;
        if (this.proc === null || this.proc.halted()) {
            this.start();
        }
        const up = await until(() => this.link()?.up === true);
        this.check(line, 'connected', up ? 'connected' : 'no connection');
    }

    private async daemonSaid(line: number, text: string): Promise<void> {
        const link = this.link();
        if (link === undefined || link.closedByRelay) {
            return;
        }
        await until(() => link.inbox.length > 0 || link.closed);
        const heard = link.inbox.shift();
        this.check(line, text, heard ?? '<closed>');
        if (heard !== undefined) {
            link.deliver(heard);
        }
    }

    private async client(line: number, text: string): Promise<void> {
        const link = this.link();
        if (link === undefined) {
            return this.check(line, text, 'no connection');
        }
        if (isForeign(text, this.cursor === 0 && link.dropped !== null)) {
            link.socket.write(`${text}\n`);
            this.played.injected.push(`${this.t.name}.transcript ${text}`);
            return undefined;
        }
        if (link.sent[this.cursor] !== text) {
            this.stimulate(text);
        }
        this.check(line, text, link.sent[this.cursor] ?? '<nothing>');
        this.cursor += 1;
        return undefined;
    }

    private stimulate(text: string): void {
        const message = decodeClient(text);
        if ('kind' in message || this.proc === null) {
            return;
        }
        if (message.t === 'key') {
            this.proc.input(message.key);
        } else if (message.t === 'tap') {
            this.proc.input(`\u001B[<0;${message.col};${message.row}M`);
        } else if (message.t === 'resize') {
            this.proc.resize(message.cols, message.rows);
        } else if (message.t === 'ping') {
            this.scheduler.fire(TIMING.pingEveryMs);
        }
    }

    private async closed(line: number, side: 'daemon' | 'pane'): Promise<void> {
        if (side === 'pane' && this.proc !== null && !this.proc.halted() && this.proc.state() === 'connected') {
            this.proc.input(CTRL_C);
        }
        const link = this.link();
        const closed = await until(() => link?.closed === true);
        link?.release();
        this.check(line, '<closed>', closed ? '<closed>' : 'open');
    }

    private effect(line: number, word: string): void {
        const effects = this.proc?.effects ?? [];
        this.check(line, word, effects.includes(word) ? word : `[${effects.join(',')}]`);
        effects.splice(0);
    }

    private check(line: number, expected: string, actual: string): void {
        if (expected !== actual) {
            this.played.mismatches.push({ line, expected, actual });
        }
    }
}

async function playAsRelay(t: Transcript, directory: string): Promise<Played> {
    const player = new RelayPlayer(t, directory);
    try {
        for (const item of t.items) {
            await player.play(item);
        }
    } finally {
        await player.finish();
    }
    return player.played;
}

async function withPluginDir(diskVersion: string, run: (directory: string) => Promise<void>): Promise<void> {
    const directory = mkdtempSync(join(tmpdir(), 'pane-relay-'));
    try {
        writeFileSync(join(directory, 'herdr-plugin.toml'), `id = "tab-recap"\nversion = "${diskVersion}"\n`);
        await run(directory);
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
}

const welcome = (version: string, title: string): DaemonMessage => ({ t: 'welcome', protocol: PROTOCOL, version, title, texts: DEFAULT_TEXTS });

const envFor = (directory: string, role: RelayEnv['hello']['role']): RelayEnv => ({ hello: { role, tab: 't1', pane: null, version: '9.9.9' }, facts: { rolledFor: null }, stateDir: urlOf(directory), pluginRoot: urlOf(directory) });

const realConnect: Connect = (path: string): Socket => new Wire(new Set(), true).connect(path);

const injectedFor = new Map<string, readonly string[]>();

for (const name of NAMES) {
    test(`${name}: playAsDaemon and the real relay agree over a unix socket, with a fake clock and a fake execve`, async () => {
        const t = readTranscript(join(FOLDER, name));
        await withPluginDir(t.settings.diskVersion, async (directory) => {
            const socketPath = viewSocketPath(directory);
            const daemon = playAsDaemon(t, socketPath, fakeClock());
            assert.ok(await until(() => existsSync(socketPath)), 'the daemon player listens');
            const relay = await playAsRelay(t, directory);
            assert.deepEqual({ daemon: await daemon, relay: relay.mismatches }, { daemon: [], relay: [] });
            injectedFor.set(name, relay.injected);
        });
    });
}

test('only the lines a relay never writes are injected by the harness: a line that is not JSON, a first line that is not hello, a hello of another protocol, an unknown type', () => {
    assert.equal(injectedFor.size, NAMES.length);
    assert.deepEqual([...injectedFor.values()].flat().toSorted(), INJECTED);
});

test('the relay player bites: a state or an effect the relay does not reach is a mismatch', async () => {
    const t = readTranscript(join(FOLDER, 'modal-close.transcript'));
    const changed: Transcript = { ...t, items: t.items.map((item) => {
        if (item.kind === 'state') {
            return { line: item.line, kind: 'state', state: 'daemon-down' };
        }
        return item.kind === 'effect' ? { line: item.line, kind: 'effect', word: 'reexec' } : item;
    }) };
    await withPluginDir(t.settings.diskVersion, async (directory) => {
        const socketPath = viewSocketPath(directory);
        const daemon = playAsDaemon(t, socketPath, fakeClock());
        assert.ok(await until(() => existsSync(socketPath)));
        const relay = await playAsRelay(changed, directory);
        assert.deepEqual(await daemon, []);
        assert.deepEqual(relay.mismatches.map((mismatch) => `${mismatch.expected} ${mismatch.actual}`), ['daemon-down connected', 'reexec [exit]']);
    });
});

test('relayEnvOf reads the role, tab, pane and roll marker from the environment and the state directory in the order of stateDir()', () => {
    const root = urlOf(ROOT);
    const home = urlOf(homedir());
    const version = relayEnvOf({}, root).hello.version;
    assert.equal(version, codeVersion(ROOT));
    assert.deepEqual(relayEnvOf({ TAB_RECAP_TAB: 't7', TAB_RECAP_SHAPE: 'bar', HERDR_PANE_ID: 'p3', TAB_RECAP_PANE_ROLLED: '3.0.3', TAB_RECAP_STATE: '/s' }, root), { hello: { role: 'bar', tab: 't7', pane: 'p3', version }, facts: { rolledFor: '3.0.3' }, stateDir: new URL('file:///s/'), pluginRoot: root });
    assert.equal(relayEnvOf({ TAB_RECAP_MODE: 'modal', TAB_RECAP_SHAPE: 'bar' }, root).hello.role, 'modal');
    assert.deepEqual(relayEnvOf({ HERDR_PANE_ID: '', TAB_RECAP_PANE_ROLLED: '' }, root, home), { hello: { role: 'column', tab: '', pane: null, version }, facts: { rolledFor: null }, stateDir: urlOf(xdgPaths(homedir()).stateDir), pluginRoot: root });
    assert.equal(relayEnvOf({}, urlOf(join(ROOT, 'no-such-root'))).hello.version, 'unknown');
    const saved = { state: process.env['TAB_RECAP_STATE'], herdr: process.env['HERDR_PLUGIN_STATE_DIR'] };
    try {
        for (const [state, herdr] of [['/a', '/b'], ['', '/b'], ['', '']]) {
            process.env['TAB_RECAP_STATE'] = state;
            process.env['HERDR_PLUGIN_STATE_DIR'] = herdr;
            assert.equal(viewSocketPath(fileURLToPath(relayEnvOf(process.env, root).stateDir)), viewSocketPath(stateDir()), `${state} ${herdr}`);
        }
    } finally {
        process.env['TAB_RECAP_STATE'] = saved.state ?? '';
        process.env['HERDR_PLUGIN_STATE_DIR'] = saved.herdr ?? '';
    }
});

test('the relay sets the titles herdr finds the column and the bar by before any welcome', () => {
    assert.equal(titleOf('column').title, COLUMN_TITLE);
    assert.equal(titleOf('modal').title, COLUMN_TITLE);
    assert.equal(titleOf('bar').title, BAR_TITLE);
});

test('the relay enters the screen, paints each frame with paintOf under the welcome title, and leaves the screen on Ctrl-C', async () => {
    await withPluginDir('9.9.9', async (directory) => {
        const lines = ['one', 'two', 'footer'];
        const daemon = await startFakeViewDaemon(viewSocketPath(directory), (message: ClientMessage) => (message.t === 'hello' ? [welcome('9.9.9', 'Recap X'), { t: 'frame', lines }] : []));
        const proc = fakeProcess({ connect: realConnect, scheduler: new Scheduler(), cols: 40, rows: 6, colour: true, exec: 'replaced' });
        const done = runRelay(envFor(directory, 'column'), proc.io);
        assert.ok(await until(() => proc.writes.includes(paintOf('Recap X', lines, true))));
        assert.equal(proc.writes[0], ENTER('column', 'tab-recap'));
        assert.equal(proc.writes[1], paintOf('tab-recap', [DEFAULT_TEXTS.connecting], true));
        assert.equal(proc.state(), 'connected');
        proc.input(CTRL_C);
        await done;
        assert.equal(proc.writes.at(-1), LEAVE);
        assert.deepEqual(proc.effects, ['exit']);
        await daemon.stop();
    });
});

test('a bye protocol with no re-exec allowed draws the two version-mismatch lines of WC 3.5', async () => {
    await withPluginDir('9.9.9', async (directory) => {
        const daemon = await startFakeViewDaemon(viewSocketPath(directory), (message: ClientMessage) => (message.t === 'hello' ? [{ t: 'bye', why: 'protocol', protocol: 2, version: '4.0.0' }] : []));
        const proc = fakeProcess({ connect: realConnect, scheduler: new Scheduler(), cols: 40, rows: 6, colour: false, exec: 'replaced' });
        const done = runRelay(envFor(directory, 'column'), proc.io);
        assert.ok(await until(() => proc.state() === 'version-mismatch'));
        assert.equal(proc.writes.at(-1), paintOf('tab-recap', [DEFAULT_TEXTS.mismatch, 'pane 9.9.9 (protocol 1) · daemon 4.0.0 (protocol 2)'], false));
        assert.deepEqual(proc.execs, []);
        proc.input(CTRL_C);
        await done;
        await daemon.stop();
    });
});

test('a failed execve re-execs once with TAB_RECAP_PANE_ROLLED, enters the screen again and connects as if it could not exec', async () => {
    await withPluginDir('10.0.0', async (directory) => {
        const daemon = await startFakeViewDaemon(viewSocketPath(directory), (message: ClientMessage) => (message.t === 'hello' ? [welcome('10.0.0', 'tab-recap'), { t: 'frame', lines: ['a'] }] : []));
        const proc = fakeProcess({ connect: realConnect, scheduler: new Scheduler(), cols: 40, rows: 6, colour: false, exec: 'failed' });
        const done = runRelay(envFor(directory, 'column'), proc.io);
        assert.ok(await until(() => proc.writes.includes(paintOf('tab-recap', ['a'], false))));
        assert.deepEqual(proc.execs.map((env) => env['TAB_RECAP_PANE_ROLLED']), ['10.0.0']);
        assert.equal(proc.state(), 'connected');
        const left = proc.writes.indexOf(LEAVE);
        assert.ok(left > 0 && proc.writes[left + 1] === ENTER('column', 'tab-recap'), JSON.stringify(proc.writes));
        proc.input(CTRL_C);
        await done;
        await daemon.stop();
    });
});

test('q and Esc end the modal locally even with no daemon; q in the column is not a local key', async () => {
    await withPluginDir('9.9.9', async (directory) => {
        for (const key of ['q', '\u001B']) {
            const proc = fakeProcess({ connect: realConnect, scheduler: new Scheduler(), cols: 40, rows: 6, colour: false, exec: 'replaced' });
            const done = runRelay(envFor(directory, 'modal'), proc.io);
            proc.input(key);
            await done;
            assert.deepEqual(proc.effects, ['exit']);
            assert.equal(proc.writes.at(-1), LEAVE);
        }
        const column = fakeProcess({ connect: realConnect, scheduler: new Scheduler(), cols: 40, rows: 6, colour: false, exec: 'replaced' });
        const done = runRelay(envFor(directory, 'column'), column.io);
        column.input('q');
        assert.deepEqual(column.effects, []);
        column.input(CTRL_C);
        await done;
        assert.deepEqual(column.effects, ['exit']);
    });
});

const SCRIPT = spawnSync('script', ['--version'], { encoding: 'utf8' }).status === 0;
if (!SCRIPT) process.stdout.write('NOT COVERED: no script (util-linux) for the pseudo-terminal test\n');

test('bun bin/tab-recap.mjs pane with no daemon draws the daemon-down lines within 4 s of entering the screen, in a pseudo-terminal', { skip: !SCRIPT }, async () => {
    const state = mkdtempSync(join(tmpdir(), 'pane-pty-'));
    const command = `stty cols 40 rows 6; exec '${process.execPath}' bin/tab-recap.mjs pane t1`;
    const child = spawn('script', ['-qfec', command, '/dev/null'], { cwd: ROOT, env: { ...process.env, TAB_RECAP_VIEW_SERVER: 'on', TAB_RECAP_STATE: state, HERDR_PLUGIN_STATE_DIR: '', HERDR_PLUGIN_CONFIG_DIR: state, TAB_RECAP_LOCALE: 'en' }, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    let entered = 0;
    child.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString('utf8');
        entered = entered === 0 && output.includes('\u001B[?1049h') ? Date.now() : entered;
    });
    try {
        const drawn = await until(() => output.includes(DEFAULT_TEXTS.down) && output.includes(DEFAULT_TEXTS.downHint), 10_000);
        const took = Date.now() - entered;
        assert.ok(drawn, JSON.stringify(output));
        assert.ok(entered > 0 && took <= 4000, `took ${took} ms`);
    } finally {
        child.kill('SIGKILL');
        rmSync(state, { recursive: true, force: true });
    }
});
