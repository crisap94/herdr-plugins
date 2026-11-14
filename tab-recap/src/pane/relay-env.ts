import type { createConnection } from 'node:net';
import { homedir } from 'node:os';
import type { ReadStream, WriteStream } from 'node:tty';
import { pathToFileURL } from 'node:url';
import type { Conn, Facts } from '../wire/view/connection.ts';
import type { Hello, Role, Welcome } from '../wire/view/protocol.ts';
import { readDiskVersion } from './version.ts';

export interface RelayEnv {
    readonly hello: Pick<Hello, 'role' | 'tab' | 'pane' | 'version'>;
    readonly facts: Pick<Facts, 'rolledFor'>;
    readonly stateDir: URL;
    readonly pluginRoot: URL;
}

export interface RelayIo {
    readonly connect: typeof createConnection;
    readonly out: Pick<WriteStream, 'write' | 'columns' | 'rows' | 'on'>;
    readonly colour: Pick<Hello, 'colour'>;
    readonly input: Pick<ReadStream, 'on'>;
    readonly setTimeout: typeof setTimeout;
    readonly clearTimeout: typeof clearTimeout;
    readonly now: typeof Date.now;
    readonly execve: NonNullable<typeof process.execve> | null;
    readonly exit: typeof process.exit;
    readonly seen: ((conn: Conn) => void) | null;
}

const STATE_UNDER_HOME = '.local/state/herdr/plugins/tab-recap/';

const roleOf = (env: NodeJS.ProcessEnv): Role => {
    if (env['TAB_RECAP_MODE'] === 'modal') {
        return 'modal';
    }
    return env['TAB_RECAP_SHAPE'] === 'bar' ? 'bar' : 'column';
};

export function titleOf(role: Role): Pick<Welcome, 'title'> {
    return { title: role === 'bar' ? 'tab-recap:bar' : 'tab-recap' };
}

export function cookedExecve(stdin: Pick<ReadStream, 'isTTY' | 'setRawMode'>, execve: NonNullable<typeof process.execve>): NonNullable<typeof process.execve> {
    return (file, args, env) => {
        if (stdin.isTTY) {
            stdin.setRawMode(false);
        }
        try {
            return execve(file, args, env);
        } catch (error) {
            if (stdin.isTTY) {
                stdin.setRawMode(true);
            }
            throw error;
        }
    };
}

export function relayEnvOf(env: NodeJS.ProcessEnv, pluginRoot: URL, home: URL = pathToFileURL(`${homedir()}/`)): RelayEnv {
    const set = new Map(Object.entries(env).filter((entry) => entry[1] !== undefined && entry[1] !== ''));
    const state = set.get('TAB_RECAP_STATE') ?? set.get('HERDR_PLUGIN_STATE_DIR');
    return {
        hello: { role: roleOf(env), tab: env['TAB_RECAP_TAB'] ?? '', pane: set.get('HERDR_PANE_ID') ?? null, version: readDiskVersion(pluginRoot).diskVersion ?? 'unknown' },
        facts: { rolledFor: set.get('TAB_RECAP_PANE_ROLLED') ?? null },
        stateDir: state === undefined ? new URL(STATE_UNDER_HOME, home) : pathToFileURL(`${state}/`),
        pluginRoot,
    };
}
