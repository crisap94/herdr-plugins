import type { Socket } from 'node:net';
import { fileURLToPath } from 'node:url';
import { LineSplitter, decodeDaemon, encode } from '../wire/view/codec.ts';
import { initialConn, step } from '../wire/view/connection.ts';
import type { Conn, ConnEvent, ConnState, Effect, Facts } from '../wire/view/connection.ts';
import { localOf } from '../wire/view/keys.ts';
import { ENTER, LEAVE, paintOf } from '../wire/view/paint.ts';
import { DEFAULT_TEXTS, PROTOCOL, TIMING } from '../wire/view/protocol.ts';
import type { ClientMessage, DaemonMessage, FrameMessage, Key, StatusTexts, Welcome } from '../wire/view/protocol.ts';
import { viewSocketPath } from '../wire/paths.ts';
import { readDiskVersion } from './version.ts';
import { titleOf } from './relay-env.ts';
import type { RelayEnv, RelayIo } from './relay-env.ts';

type Status = Exclude<ConnState, 'connected'>;
type Exec = 'replaced' | 'failed';
type Timer = NodeJS.Timeout | null;

const TAP_START = '\u001B[<0;';
const TAP_END = 'M';

class Relay {
    private conn: Conn = initialConn;

    private texts: StatusTexts = DEFAULT_TEXTS;

    private title: string;

    private daemon: Pick<Welcome, 'version' | 'protocol'> = { version: '', protocol: PROTOCOL };

    private screen: readonly string[] = [];

    private painted = '';

    private socket: Socket | null = null;

    private linkUp = false;

    private execBroken = false;

    private halted = false;

    private connectTimer: Timer = null;

    private welcomeTimer: Timer = null;

    private pingTimer: Timer = null;

    private pongTimer: Timer = null;

    private readonly env: RelayEnv;

    private readonly io: RelayIo;

    private readonly done: () => void;

    constructor(env: RelayEnv, io: RelayIo, done: () => void) {
        this.env = env;
        this.io = io;
        this.done = done;
        this.title = titleOf(env.hello.role).title;
    }

    start(): void {
        this.io.out.write(ENTER(this.env.hello.role, this.title));
        this.drawStatus({ kind: 'draw-status', state: 'connecting', keepFrame: false });
        this.io.input.on('data', (chunk) => { this.pressed({ t: 'key', key: chunk.toString() }); });
        this.io.out.on('resize', () => { this.resized(); });
        this.open();
    }

    private open(): void {
        const socket = this.io.connect(viewSocketPath(fileURLToPath(this.env.stateDir)));
        const splitter = new LineSplitter();
        this.socket = socket;
        this.linkUp = false;
        socket.on('connect', () => { if (socket === this.socket) this.connected(); });
        socket.on('data', (chunk) => {
            for (const part of splitter.push(chunk)) {
                const message = typeof part === 'string' ? decodeDaemon(part) : part;
                if (socket === this.socket && !this.halted && !('kind' in message)) this.heard(message);
            }
        });
        socket.on('error', () => undefined);
        socket.on('close', () => { if (socket === this.socket) this.closed(); });
    }

    private connected(): void {
        this.linkUp = true;
        this.send({ t: 'hello', protocol: PROTOCOL, ...this.env.hello, cols: this.io.out.columns || 40, rows: this.io.out.rows || 24, colour: this.io.colour.colour });
        this.welcomeTimer = this.io.setTimeout(() => { this.lose(); }, TIMING.welcomeMs);
    }

    private heard(message: DaemonMessage): void {
        if (message.t === 'frame') {
            this.framed(message);
            return;
        }
        if (message.t === 'pong') {
            this.pongTimer = this.cancel(this.pongTimer);
            return;
        }
        this.welcomeTimer = this.cancel(this.welcomeTimer);
        this.daemon = { version: message.version, protocol: message.protocol };
        if (message.t === 'bye') {
            this.apply({ kind: 'bye', why: message.why, protocol: message.protocol, version: message.version });
            return;
        }
        this.texts = message.texts;
        this.title = message.title;
        this.apply({ kind: 'welcome', protocol: message.protocol, version: message.version });
        this.startPing();
    }

    private framed(message: FrameMessage): void {
        if (this.conn.state !== 'connected') return;
        this.conn = { ...this.conn, hasFrame: true };
        this.screen = message.lines;
        this.paint();
        this.io.seen?.(this.conn);
    }

    private closed(): void {
        const event: ConnEvent = this.linkUp ? { kind: 'lost' } : { kind: 'connect-failed' };
        this.drop();
        this.apply(event);
    }

    private lose(): void {
        this.drop();
        this.apply({ kind: 'lost' });
    }

    private drop(): void {
        this.welcomeTimer = this.cancel(this.welcomeTimer);
        this.pingTimer = this.cancel(this.pingTimer);
        this.pongTimer = this.cancel(this.pongTimer);
        const socket = this.socket;
        this.socket = null;
        this.linkUp = false;
        socket?.destroy();
    }

    private cancel(timer: Timer): null {
        if (timer !== null) this.io.clearTimeout(timer);
        return null;
    }

    private apply(event: ConnEvent): void {
        const result = step(this.conn, event, this.facts());
        this.conn = result.conn;
        for (const effect of result.effects) {
            if (!this.halted) {
                this.run(effect, event);
            }
        }
        this.io.seen?.(this.conn);
    }

    private run(effect: Effect, event: ConnEvent): void {
        if (effect.kind === 'exit') {
            this.finish();
            return;
        }
        this.schedule(effect);
        this.drawStatus(effect);
        if (effect.kind === 'reexec') this.reexec(effect, event);
    }

    private facts(): Facts {
        return { now: this.io.now(), role: this.env.hello.role, ownVersion: this.env.hello.version, diskVersion: readDiskVersion(this.env.pluginRoot).diskVersion, rolledFor: this.env.facts.rolledFor, canExec: !this.execBroken };
    }

    private schedule(effect: Effect): void {
        if (effect.kind !== 'connect') return;
        this.drop();
        this.connectTimer = this.cancel(this.connectTimer);
        this.connectTimer = this.io.setTimeout(() => {
            this.connectTimer = null;
            this.open();
        }, effect.afterMs);
    }

    private startPing(): void {
        if (this.conn.state === 'connected' && !this.halted) {
            this.pingTimer = this.io.setTimeout(() => { this.ping(); }, TIMING.pingEveryMs);
        }
    }

    private ping(): void {
        this.send({ t: 'ping' });
        this.pongTimer = this.cancel(this.pongTimer);
        this.pongTimer = this.io.setTimeout(() => { this.lose(); }, TIMING.pongMs);
        this.startPing();
    }

    private reexec(effect: Effect, event: ConnEvent): void {
        this.io.out.write(LEAVE);
        if (this.exec(effect) === 'replaced') {
            this.halt();
            return;
        }
        this.execBroken = true;
        this.io.out.write(ENTER(this.env.hello.role, this.title));
        this.repaint();
        this.apply(event);
    }

    private exec(effect: Effect): Exec {
        const execve = this.io.execve;
        if (execve === null || effect.kind !== 'reexec') return 'failed';
        try {
            execve(process.execPath, [process.execPath, ...process.execArgv, ...process.argv.slice(1)], { ...process.env, TAB_RECAP_PANE_ROLLED: effect.toward });
        } catch {
            return 'failed';
        }
        return 'replaced';
    }

    private pressed(input: Key): void {
        if (this.halted) return;
        if (localOf(this.env.hello.role, input.key) === 'exit') {
            this.finish();
            return;
        }
        if (this.conn.state !== 'connected') return;
        const [col, row, ...rest] = input.key.startsWith(TAP_START) && input.key.endsWith(TAP_END) ? input.key.slice(TAP_START.length, -TAP_END.length).split(';') : [];
        const tap = col !== undefined && row !== undefined && rest.length === 0;
        this.send(tap ? { t: 'tap', col: Number(col), row: Number(row) } : input);
    }

    private resized(): void {
        if (this.halted) return;
        if (this.conn.state === 'connected') {
            this.send({ t: 'resize', cols: this.io.out.columns || 40, rows: this.io.out.rows || 24 });
        }
        this.repaint();
    }

    private drawStatus(effect: Effect): void {
        if (effect.kind !== 'draw-status' || effect.keepFrame) return;
        this.screen = this.statusFrame(effect.state).lines;
        this.paint();
    }

    private statusFrame(state: Status): FrameMessage {
        if (state === 'connecting') {
            return { t: 'frame', lines: [this.texts.connecting] };
        }
        if (state === 'daemon-down') {
            return { t: 'frame', lines: (this.io.out.rows || 24) > 1 ? [this.texts.down, this.texts.downHint] : [this.texts.down] };
        }
        return { t: 'frame', lines: [this.texts.mismatch, `pane ${this.env.hello.version} (protocol ${PROTOCOL}) · daemon ${this.daemon.version} (protocol ${this.daemon.protocol})`] };
    }

    private paint(): void {
        const bytes = paintOf(this.title, this.screen, this.io.colour.colour);
        if (bytes !== this.painted) {
            this.repaint();
        }
    }

    private repaint(): void {
        this.painted = paintOf(this.title, this.screen, this.io.colour.colour);
        this.io.out.write(this.painted);
    }

    private send(message: ClientMessage): void {
        this.socket?.write(encode(message));
    }

    private finish(): void {
        this.io.out.write(LEAVE);
        this.halt();
        this.io.exit(0);
    }

    private halt(): void {
        if (this.halted) return;
        this.halted = true;
        this.connectTimer = this.cancel(this.connectTimer);
        this.drop();
        this.done();
    }
}

export function runRelay(env: RelayEnv, io: RelayIo): Promise<void> {
    return new Promise((resolve) => {
        new Relay(env, io, resolve).start();
    });
}
