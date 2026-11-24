import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseCount, type Count } from '@stateforge-labs/session-ledger';
import { textOf, type Text } from '@stateforge-labs/session-ledger';

export { MIN_BUN, bunAtLeast } from '#src/host/policy.mjs';

export interface CommandBinding {
    readonly key: Text;
    readonly action: Text;
}

type Table = Readonly<Record<string, unknown>>;

const isTable = (value: unknown): value is Table => typeof value === 'object' && value !== null && !Array.isArray(value);

export const bunMajorOf = (version: Text): Count | null => {
    const found = /^v?(\d+)\.\d+\.\d+/.exec(version.trim());
    if (found?.[1] === undefined) {
        return null;
    }
    const major = parseCount(Number(found[1]));
    return major.kind === 'ok' ? major.value : null;
};

export const bindingsIn = (toml: Text): readonly CommandBinding[] => {
    try {
        const parsed: unknown = Bun.TOML.parse(toml);
        const keys = isTable(parsed) ? parsed['keys'] : undefined;
        const commands: unknown = isTable(keys) ? keys['command'] : undefined;
        if (!Array.isArray(commands)) {
            return [];
        }
        return commands.flatMap((entry) => {
            const key = isTable(entry) ? entry['key'] : undefined;
            const command = isTable(entry) ? entry['command'] : undefined;
            return typeof key === 'string' && typeof command === 'string' && command.startsWith('tab-recap.')
                ? [{ key: textOf(key), action: textOf(command) }]
                : [];
        });
    } catch {
        return [];
    }
};

export const herdrConfigPathOf = (env: NodeJS.ProcessEnv = process.env, home: Text = textOf(homedir())): Text =>
    textOf(env['HERDR_CONFIG_PATH'] || join(home, '.config', 'herdr', 'config.toml'));

export const boundKeysIn = (path: Text = herdrConfigPathOf()): readonly CommandBinding[] => {
    try {
        return bindingsIn(textOf(readFileSync(path, 'utf8')));
    } catch {
        return [];
    }
};
