// What `status` says about the machine the plugin runs on: the Node that runs it and the keys the operator bound. Read-only.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** The Node the plugin needs: it runs the TypeScript directly, and the state lives in `node:sqlite` as it is from 24.14 (no experimental warning). */
export const MIN_NODE = '24.14.0';

const versionParts = (text: string): number[] => (/^v?(\d+)\.(\d+)\.(\d+)/.exec(text.trim()) ?? []).slice(1).map(Number);

/** Whether `version` (`v24.14.0`) is `minimum` or newer; false for anything that is not a version. */
export function nodeAtLeast(version: string, minimum: string = MIN_NODE): boolean {
    const [have, need] = [versionParts(version), versionParts(minimum)];
    if (have.length !== 3) {
        return false;
    }
    const at = need.findIndex((part, index) => part !== have[index]);
    return at === -1 || (have[at] ?? 0) > (need[at] ?? 0);
}

/** The major of a `process.version` (`v24.1.0`); null for anything else. */
export function nodeMajor(version: string): number | null {
    const found = /^v?(\d+)\.\d+\.\d+/.exec(version.trim());
    return found?.[1] === undefined ? null : Number(found[1]);
}

export interface Binding {
    readonly key: string;
    readonly action: string;
}

const ASSIGNMENT = /^(\w+)\s*=\s*"([^"]*)"\s*(?:#.*)?$/;

/** The `[[keys.command]]` blocks that run a `tab-recap.*` action, in file order; a strict line match, no TOML parser. */
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

/** Where herdr reads its config: `HERDR_CONFIG_PATH`, else `~/.config/herdr/config.toml` (macOS too). */
export const herdrConfigPath = (env: NodeJS.ProcessEnv = process.env, home: string = homedir()): string =>
    env['HERDR_CONFIG_PATH'] || join(home, '.config', 'herdr', 'config.toml');

/** The tab-recap bindings in herdr's config; none when the file is missing or unreadable. */
export function boundKeys(path: string = herdrConfigPath()): readonly Binding[] {
    try {
        return bindingsOf(readFileSync(path, 'utf8'));
    } catch {
        return [];
    }
}
