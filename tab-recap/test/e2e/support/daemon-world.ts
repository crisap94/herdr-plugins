import { spawn } from 'node:child_process';
import { accessSync, closeSync, constants, existsSync, mkdirSync, openSync, readFileSync, symlinkSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { Method, PROTOCOL } from '@stateforge-labs/herdr-sdk';
import { createFakeHerdr, type FakeHerdr } from '@stateforge-labs/herdr-sdk/test-kit';
import { scratch } from '#test/fixtures/git-repo.ts';
import { BUN_CACHE_OFF } from '#test/support/bun-env.ts';

const PLUGIN = join(import.meta.dirname, '..', '..', '..');
const FAKE_MODEL = join(import.meta.dirname, 'fake-model.sh');
const DAEMON_ENTRY = join('src', 'daemon', 'launch.mjs');
const COMMAND_ENTRY = join(PLUGIN, 'bin', 'tab-recap.mjs');
const FORBIDDEN = ['herdr', 'hc', 'claude', 'codex', 'opencode'];
const TOOLS = ['sh', 'git'];
const WITHIN = 10_000;
const EVERY = 25;
const GRACE = 5_000;

export interface Ran {
    readonly code: number | null;
    readonly stdout: string;
    readonly stderr: string;
}

export interface Waiting {
    readonly within?: number;
    readonly after?: number;
}

export interface Pidfile {
    readonly pid: number | null;
    readonly version: string | null;
    readonly disabled: boolean;
}

export interface Child {
    readonly pid: number;
    readonly exited: Promise<number>;
}

export interface DaemonWorld {
    readonly herdr: FakeHerdr;
    readonly stateDir: string;
    command(...args: readonly string[]): Promise<Ran>;
    daemon(): Child;
    awaitLog(pattern: RegExp, waiting?: Waiting): Promise<{ readonly line: string; readonly cursor: number }>;
    log(): string;
    pidfile(): Pidfile;
    awaitGone(pid: number, waiting?: Waiting): Promise<void>;
    stop(): Promise<Ran>;
    alive(pid: number): boolean;
    close(): Promise<void>;
}

const nap = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms); });

async function until<T>(probe: () => T | undefined | Promise<T | undefined>, within: number, describe: () => string): Promise<T> {
    const deadline = Date.now() + within;
    let seen: T | undefined;
    while (Date.now() < deadline) {
        seen = await probe();
        if (seen !== undefined) {
            return seen;
        }
        await nap(EVERY);
    }
    throw new Error(`timed out after ${within} ms: ${describe()}`);
}

function isAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

function readText(path: string): string {
    try {
        return readFileSync(path, 'utf8');
    } catch {
        return '';
    }
}

function findOnPath(name: string): string | null {
    for (const directory of (process.env['PATH'] ?? '').split(delimiter)) {
        const candidate = join(directory, name);
        try {
            accessSync(candidate, constants.X_OK);
            return candidate;
        } catch { }
    }
    return null;
}

function toolsDirectory(root: string): string {
    const bin = join(root, 'bin');
    mkdirSync(bin, { recursive: true });
    for (const name of TOOLS) {
        const found = findOnPath(name);
        if (found !== null) {
            symlinkSync(found, join(bin, name));
        }
    }
    for (const name of FORBIDDEN) {
        if (existsSync(join(bin, name))) {
            throw new Error(`the world's PATH must not resolve ${name}`);
        }
    }
    return bin;
}

function isThisWorldsDaemon(pid: number, stateDir: string): boolean {
    try {
        const command = readFileSync(`/proc/${pid}/cmdline`, 'utf8');
        const environment = readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0');
        return command.includes(DAEMON_ENTRY) && environment.includes(`TAB_RECAP_STATE=${stateDir}`);
    } catch {
        return false;
    }
}

export async function daemonWorld(): Promise<DaemonWorld> {
    const fixture = scratch('tab-recap-e2e-');
    const root = fixture.root;
    const stateDir = join(root, 'state');
    const configDir = join(root, 'config');
    const home = join(root, 'home');
    const socket = join(root, 'h.sock');
    for (const directory of [stateDir, configDir, join(home, 'config'), join(home, 'state'), join(home, 'data'), join(home, 'cache')]) {
        mkdirSync(directory, { recursive: true });
    }
    const herdr = await createFakeHerdr({ socketPath: socket });
    herdr.reply(Method.SessionSnapshot, {
        type: 'session_snapshot',
        snapshot: { agents: [], layouts: [], panes: [], protocol: PROTOCOL, tabs: [], version: '0', workspaces: [] },
    });
    const env: Record<string, string> = {
        PATH: toolsDirectory(root),
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
        TAB_RECAP_BACKEND: 'custom',
        TAB_RECAP_CUSTOM_CMD: FAKE_MODEL,
        TAB_RECAP_AUTOCOMPACT: 'off',
        TAB_RECAP_LOCALE: 'en',
        HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify({ tab_id: 'w1:t1', pane_id: 'w1:p2' }),
        ...BUN_CACHE_OFF,
    };
    const logPath = join(stateDir, 'daemon.log');
    const pidPath = join(stateDir, 'daemon.pid');
    const tracked = new Set<number>();
    const adopt = (): void => {
        const named = Number(readText(pidPath).trim());
        if (Number.isInteger(named) && named > 0) {
            tracked.add(named);
        }
    };
    const log = (): string => readText(logPath);

    const command = async (...args: readonly string[]): Promise<Ran> => {
        const child = spawn(process.execPath, [COMMAND_ENTRY, ...args], { cwd: PLUGIN, env, stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
        child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
        const timer = setTimeout(() => { child.kill('SIGKILL'); }, WITHIN);
        const code = await new Promise<number | null>((resolve) => { child.on('close', resolve); });
        clearTimeout(timer);
        adopt();
        const named = /daemon started \(pid (\d+)\)/.exec(stdout)?.[1];
        if (named !== undefined) {
            tracked.add(Number(named));
        }
        return { code, stdout, stderr };
    };

    const daemon = (): Child => {
        const out = openSync(logPath, 'a');
        const child = spawn(process.execPath, [join(PLUGIN, DAEMON_ENTRY)], { cwd: PLUGIN, env, stdio: ['ignore', out, out] });
        closeSync(out);
        const pid = child.pid ?? 0;
        tracked.add(pid);
        const exited = new Promise<number>((resolve) => { child.on('close', (code) => { resolve(code ?? -1); }); });
        return { pid, exited };
    };

    const awaitLog = (pattern: RegExp, waiting: Waiting = {}): Promise<{ readonly line: string; readonly cursor: number }> => {
        const from = waiting.after ?? 0;
        return until(() => {
            const text = log();
            const found = pattern.exec(text.slice(from));
            return found === null ? undefined : { line: found[0], cursor: from + found.index + found[0].length };
        }, waiting.within ?? WITHIN, () => `no log line matched ${pattern}; the log ends: ${log().slice(-400)}`);
    };

    const pidfile = (): Pidfile => {
        const named = Number(readText(pidPath).trim());
        const version = readText(join(stateDir, 'daemon.version')).trim();
        return { pid: Number.isInteger(named) && named > 0 ? named : null, version: version === '' ? null : version, disabled: existsSync(join(stateDir, 'disabled')) };
    };

    const awaitGone = async (pid: number, waiting: Waiting = {}): Promise<void> => {
        await until(() => (isAlive(pid) ? undefined : true), waiting.within ?? WITHIN, () => `pid ${pid} is still alive; the log ends: ${log().slice(-400)}`);
    };

    const stop = async (): Promise<Ran> => {
        const before = pidfile().pid;
        const ran = await command('stop');
        if (before !== null) {
            await awaitGone(before);
        }
        return ran;
    };

    const close = async (): Promise<void> => {
        adopt();
        const mine = [...tracked].filter((pid) => isAlive(pid) && isThisWorldsDaemon(pid, stateDir));
        for (const pid of mine) {
            process.kill(pid, 'SIGTERM');
        }
        for (const pid of mine) {
            try {
                await awaitGone(pid, { within: GRACE });
            } catch {
                process.kill(pid, 'SIGKILL');
                await awaitGone(pid, { within: GRACE });
            }
        }
        await herdr.stop();
        fixture.clean();
        const left = [...tracked].filter((pid) => isAlive(pid) && isThisWorldsDaemon(pid, stateDir));
        if (left.length > 0) {
            throw new Error(`daemon pids still alive after close: ${left.join(', ')}`);
        }
    };

    return { herdr, stateDir, command, daemon, awaitLog, log, pidfile, awaitGone, stop, alive: isAlive, close };
}
