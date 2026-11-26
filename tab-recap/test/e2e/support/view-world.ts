import { accessSync, chmodSync, constants, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { Method, PROTOCOL } from '@stateforge-labs/herdr-sdk';
import { createFakeHerdr, type FakeHerdr } from '@stateforge-labs/herdr-sdk/test-kit';
import { instant, type Instant } from '@stateforge-labs/session-ledger';
import { databaseFile, openStoreAt, type Store } from '#src/adapters/db/database.ts';
import type { Directory } from '@stateforge-labs/session-ledger';
import { parseRoot, parseVersion, type Running } from '#src/daemon/slots.ts';
import { viewersOf } from '#src/daemon/view/viewers.ts';
import { slot } from '#src/daemon/slots/view.ts';
import type { Observation } from '#src/recap/domain/fold.ts';
import { scratch } from '#test/fixtures/git-repo.ts';
import { memoryStore } from '#test/db/support.ts';
import { BUN_CACHE_OFF } from '#test/support/bun-env.ts';

const PLUGIN = join(import.meta.dirname, '..', '..', '..');
const PANE_ENTRY = join(PLUGIN, 'src', 'pane', 'launch.mjs');
const SETUP_ENTRY = join(PLUGIN, 'src', 'setup', 'launch.mjs');
const TOOLS = ['sh', 'git'];
const FRAME_HOME = '\u001B[H';
const FRAME_END = '\u001B[J';
const LINE_END = '\u001B[K';
const RESET_SGR = '\u001B[0m';
const WITHIN = 15_000;
const EVERY = 20;
const PATCHED = ['PATH', 'HOME', 'XDG_CONFIG_HOME', 'XDG_STATE_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'HERDR_PLUGIN_CONFIG_DIR', 'HERDR_PLUGIN_STATE_DIR', 'TAB_RECAP_STATE', 'HERDR_SOCKET_PATH', 'HERDR_SOCKET', 'TAB_RECAP_LOCALE', 'TAB_RECAP_AUTOCOMPACT', 'LC_ALL', 'LC_MESSAGES', 'LANG'] as const;

interface Terminal {
    write(text: string): number;
    resize(cols: number, rows: number): void;
    close(): void;
}

interface Spawned {
    readonly pid: number;
    readonly terminal: Terminal;
    readonly exited: Promise<number>;
    kill(signal?: number | string): void;
}

interface SpawnOptions {
    readonly cwd: string;
    readonly env: Readonly<Record<string, string>>;
    readonly terminal?: { readonly cols: number; readonly rows: number; data(terminal: Terminal, data: Uint8Array): void };
    readonly stdin?: 'ignore';
    readonly stdout?: 'pipe';
    readonly stderr?: 'pipe';
}

interface BunSpawn {
    spawn(command: readonly string[], options: SpawnOptions): Spawned;
}

const ROLE_ENV: Readonly<Record<NonNullable<PaneOptions['role']>, Readonly<Record<string, string>>>> = { column: {}, bar: { TAB_RECAP_SHAPE: 'bar' }, modal: { TAB_RECAP_MODE: 'modal' } };

const bun = (): BunSpawn => Reflect.get(globalThis, 'Bun') as BunSpawn;

const nap = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms); });

async function until<T>(probe: () => T | undefined, within: number, describe: () => string): Promise<T> {
    const deadline = Date.now() + within;
    while (Date.now() < deadline) {
        const seen = probe();
        if (seen !== undefined) {
            return seen;
        }
        await nap(EVERY);
    }
    throw new Error(`timed out after ${within} ms: ${describe()}`);
}

export interface Screen {
    readonly lines: readonly string[];
    readonly plain: readonly string[];
    readonly text: string;
}

export interface PaneOptions {
    readonly cols: number;
    readonly rows: number;
    readonly tab?: string;
    readonly role?: 'column' | 'bar' | 'modal';
    readonly env?: Readonly<Record<string, string>>;
}

export interface Pane {
    readonly pid: number;
    screen(): Screen | null;
    raw(): string;
    painted(predicate: (screen: Screen) => boolean, describe: string, within?: number): Promise<Screen>;
    press(key: string): Promise<void>;
    resize(cols: number, rows: number): void;
    exited(): Promise<number>;
    close(): Promise<void>;
}

export interface ViewWorld {
    readonly store: Store;
    readonly herdr: FakeHerdr;
    readonly stateDir: string;
    requests(): ReturnType<FakeHerdr['requests']>;
    readonly configDir: string;
    readonly log: () => readonly string[];
    readonly observed: () => readonly Observation[];
    setNow(ms: number): void;
    setLocale(locale: 'en' | 'es'): void;
    pane(options: PaneOptions): Promise<Pane>;
    settings(options: PaneOptions): Promise<Pane>;
    childEnv(extra?: Readonly<Record<string, string>>): Record<string, string>;
    readonly plugin: string;
    refresh(): void;
    close(): Promise<void>;
}

export interface WorldOptions {
    readonly now: number;
    readonly version: string;
    readonly agents?: readonly string[];
    readonly herdr?: SharedHerdr;
}

export interface SharedHerdr {
    readonly herdr: FakeHerdr;
    readonly socket: string;
    close(): Promise<void>;
}

export async function sharedHerdr(): Promise<SharedHerdr> {
    const fixture = scratch('trh-');
    const socket = join(fixture.root, 'h.sock');
    const herdr = await createFakeHerdr({ socketPath: socket });
    herdr.reply(Method.SessionSnapshot, {
        type: 'session_snapshot',
        snapshot: { agents: [], layouts: [], panes: [], protocol: PROTOCOL, tabs: [], version: '0', workspaces: [] },
    });
    return { herdr, socket, close: async () => { await herdr.stop(); fixture.clean(); } };
}

export function screenOf(raw: string): Screen | null {
    const parts = raw.split(FRAME_HOME);
    for (let at = parts.length - 1; at >= 1; at -= 1) {
        const part = parts[at] ?? '';
        const end = part.indexOf(FRAME_END);
        if (end >= 0) {
            const lines = part.slice(0, end).split(/\r+\n/u).map((line) => {
                const open = line.startsWith(' ') ? line.slice(1) : line;
                const closed = open.endsWith(LINE_END) ? open.slice(0, -LINE_END.length) : open;
                return closed.endsWith(RESET_SGR) ? closed.slice(0, -RESET_SGR.length) : closed;
            });
            const plain = lines.map((line) => stripVTControlCharacters(line));
            return { lines, plain, text: plain.join('\n') };
        }
    }
    return null;
}

function toolsDirectory(root: string, agents: readonly string[]): string {
    const bin = join(root, 'bin');
    mkdirSync(bin, { recursive: true });
    for (const name of TOOLS) {
        for (const directory of (process.env['PATH'] ?? '').split(delimiter)) {
            const candidate = join(directory, name);
            try {
                accessSync(candidate, constants.X_OK);
                symlinkSync(candidate, join(bin, name));
                break;
            } catch { }
        }
    }
    for (const agent of agents) {
        const path = join(bin, agent);
        writeFileSync(path, '#!/bin/sh\nexit 0\n');
        chmodSync(path, 0o755);
    }
    return bin;
}

function paneOver(spawned: Spawned, chunks: { text: string }): Pane {
    let closed = false;
    return {
        pid: spawned.pid,
        screen: () => screenOf(chunks.text),
        raw: () => chunks.text,
        painted: (predicate, describe, within = WITHIN) => until(() => {
            const screen = screenOf(chunks.text);
            return screen !== null && predicate(screen) ? screen : undefined;
        }, within, () => `${describe}; the screen reads: ${JSON.stringify(screenOf(chunks.text)?.plain ?? null)}`),
        press: async (key) => {
            spawned.terminal.write(key);
            await nap(EVERY);
        },
        resize: (cols, rows) => { spawned.terminal.resize(cols, rows); },
        exited: () => spawned.exited,
        close: async () => {
            if (closed) {
                return;
            }
            closed = true;
            spawned.kill('SIGTERM');
            await Promise.race([spawned.exited, nap(5000)]);
            spawned.terminal.close();
        },
    };
}

export async function viewWorld(options: WorldOptions): Promise<ViewWorld> {
    const fixture = scratch('trv-');
    const root = fixture.root;
    const stateDir = join(root, 'st');
    const configDir = join(root, 'config');
    const home = join(root, 'home');
    const shared = options.herdr ?? await sharedHerdr();
    const socket = shared.socket;
    const baseline = shared.herdr.requests().length;
    for (const directory of [stateDir, configDir, join(home, 'config'), join(home, 'state'), join(home, 'data'), join(home, 'cache')]) {
        mkdirSync(directory, { recursive: true });
    }
    const herdr = shared.herdr;
    const environment: Record<string, string> = {
        PATH: toolsDirectory(root, options.agents ?? []),
        HOME: home,
        XDG_CONFIG_HOME: join(home, 'config'),
        XDG_STATE_HOME: join(home, 'state'),
        XDG_DATA_HOME: join(home, 'data'),
        XDG_CACHE_HOME: join(home, 'cache'),
        HERDR_PLUGIN_CONFIG_DIR: configDir,
        HERDR_PLUGIN_STATE_DIR: stateDir,
        TAB_RECAP_STATE: stateDir,
        HERDR_SOCKET_PATH: socket,
        HERDR_SOCKET: socket,
        TAB_RECAP_LOCALE: 'en',
        TAB_RECAP_AUTOCOMPACT: 'off',
        LC_ALL: 'C',
        LC_MESSAGES: 'C',
        LANG: 'C',
        HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify({ tab_id: 'w1:t1', pane_id: 'w1:p2' }),
    };
    const touched = [...new Set([...PATCHED, ...Object.keys(process.env).filter((key) => key.startsWith('HERDR_') || key.startsWith('TAB_RECAP_'))])];
    const saved = new Map<string, string | undefined>(touched.map((key) => [key, process.env[key]]));
    for (const key of touched) {
        delete process.env[key];
    }
    for (const [key, value] of Object.entries(environment)) {
        process.env[key] = value;
    }
    const store = memoryStore();
    const lines: string[] = [];
    const seen: Observation[] = [];
    let now = options.now;
    const running: Running = await slot.start({
        root: parseRoot(stateDir),
        version: parseVersion(options.version),
        store,
        observe: (observation) => { seen.push(observation); },
        clock: { now: (): Instant => instant(now) },
        log: (line) => { lines.push(String(line)); },
        viewers: viewersOf(),
    });
    const socketPath = join(stateDir, 'view', 'view.sock');
    await until(() => (existsSync(socketPath) ? true : undefined), WITHIN, () => 'the view socket was not bound');
    const panes: Pane[] = [];
    const spawnPane = async (entry: string, opened: PaneOptions, extra: Readonly<Record<string, string>>): Promise<Pane> => {
        const chunks = { text: '' };
        const childEnvironment: Record<string, string> = {
            ...environment,
            TERM: 'xterm-256color',
            TAB_RECAP_TAB: opened.tab ?? 'w1:t1',
            ...BUN_CACHE_OFF,
            ...extra,
            ...opened.env,
        };
        const spawned = bun().spawn([process.execPath, entry], {
            cwd: PLUGIN,
            env: childEnvironment,
            terminal: {
                cols: opened.cols,
                rows: opened.rows,
                data: (_terminal, data) => { chunks.text += Buffer.from(data).toString(); },
            },
        });
        const pane = paneOver(spawned, chunks);
        panes.push(pane);
        return pane;
    };
    return {
        store,
        herdr,
        requests: () => herdr.requests().slice(baseline),
        stateDir,
        configDir,
        log: () => lines,
        observed: () => seen,
        setNow: (ms) => { now = ms; },
        setLocale: (locale) => { process.env['TAB_RECAP_LOCALE'] = locale; },
        plugin: PLUGIN,
        childEnv: (extra = {}) => ({ ...environment, TERM: 'xterm-256color', TAB_RECAP_TAB: 'w1:t1', ...BUN_CACHE_OFF, ...extra }),
        pane: (opened) => spawnPane(PANE_ENTRY, opened, ROLE_ENV[opened.role ?? 'column']),
        settings: (opened) => spawnPane(SETUP_ENTRY, opened, { TAB_RECAP_AUTOCOMPACT: '' }),
        refresh: () => { running.poll?.(); },
        close: async () => {
            for (const pane of panes) {
                await pane.close();
            }
            await running.stop();
            if (options.herdr === undefined) {
                await shared.close();
            }
            for (const [key, value] of saved) {
                if (value === undefined) {
                    delete process.env[key];
                } else {
                    process.env[key] = value;
                }
            }
            fixture.clean();
        },
    };
}

export const configText = (world: Pick<ViewWorld, 'configDir'>): string => {
    try {
        return readFileSync(join(world.configDir, 'config.env'), 'utf8');
    } catch {
        return '';
    }
};

export const seedConfig = (world: Pick<ViewWorld, 'configDir'>, text: string): void => {
    writeFileSync(join(world.configDir, 'config.env'), text);
};

export async function withWorld<T>(options: WorldOptions, use: (world: ViewWorld) => Promise<T>): Promise<T> {
    const world = await viewWorld(options);
    try {
        return await use(world);
    } finally {
        await world.close();
    }
}

export function prepareStateStore(world: Pick<ViewWorld, 'stateDir'>): void {
    const opened = openStoreAt(databaseFile(world.stateDir as Directory));
    if (opened.kind !== 'ready') {
        throw new Error('a fresh state directory opens a store');
    }
    opened.close();
}
