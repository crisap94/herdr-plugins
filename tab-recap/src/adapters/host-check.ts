import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export { MIN_NODE, nodeAtLeast } from '#src/host/policy.mjs';

export function nodeMajor(version: string): number | null {
    const found = /^v?(\d+)\.\d+\.\d+/.exec(version.trim());
    return found?.[1] === undefined ? null : Number(found[1]);
}

export interface Binding {
    readonly key: string;
    readonly action: string;
}

const ASSIGNMENT = /^(\w+)\s*=\s*"([^"]*)"\s*(?:#.*)?$/;

export function bindingsOf(toml: string): readonly Binding[] {
    const found: Binding[] = [];
    let block: Record<string, string> | null = null;
    const close = (): void => {
        const key = block?.['key'];
        const command = block?.['command'];
        if (key !== undefined && command !== undefined && command.startsWith('tab-recap.')) {
            found.push({ key, action: command });
        }
    };
    for (const raw of toml.split('\n')) {
        const line = raw.trim();
        if (line.startsWith('[')) {
            close();
            block = line === '[[keys.command]]' ? {} : null;
            continue;
        }
        const assignment = block === null ? null : ASSIGNMENT.exec(line);
        if (block !== null && assignment?.[1] !== undefined && assignment[2] !== undefined) {
            block[assignment[1]] = assignment[2];
        }
    }
    close();
    return found;
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
