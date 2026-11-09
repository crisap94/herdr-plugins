import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export { MIN_BUN, bunAtLeast } from '#src/host/policy.mjs';

export function bunMajor(version: string): number | null {
    const found = /^v?(\d+)\.\d+\.\d+/.exec(version.trim());
    return found?.[1] === undefined ? null : Number(found[1]);
}

export interface Binding {
    readonly key: string;
    readonly action: string;
}

type Table = Readonly<Record<string, unknown>>;

const isTable = (value: unknown): value is Table => typeof value === 'object' && value !== null && !Array.isArray(value);

export function bindingsOf(toml: string): readonly Binding[] {
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
                ? [{ key, action: command }]
                : [];
        });
    } catch {
        return [];
    }
}

export const herdrConfigPath = (env: NodeJS.ProcessEnv = process.env, home: string = homedir()): string =>
    env['HERDR_CONFIG_PATH'] || join(home, '.config', 'herdr', 'config.toml');

export function boundKeys(path: string = herdrConfigPath()): readonly Binding[] {
    try {
        return bindingsOf(readFileSync(path, 'utf8'));
    } catch {
        return [];
    }
}
