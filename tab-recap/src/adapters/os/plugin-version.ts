import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

type Table = Readonly<Record<string, unknown>>;

const isTable = (value: unknown): value is Table => typeof value === 'object' && value !== null && !Array.isArray(value);

export function parseVersion(toml: string): string | null {
    try {
        const parsed: unknown = Bun.TOML.parse(toml);
        const version = isTable(parsed) ? parsed['version'] : undefined;
        return typeof version === 'string' && /^\d+\.\d+\.\d+$/.test(version) ? version : null;
    } catch {
        return null;
    }
}

export function shouldRoll(started: string | null, current: string | null, seenBefore: string | null): boolean {
    return started !== null && current !== null && current !== started && seenBefore === current;
}

const PLUGIN_ROOT = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));

export function codeVersion(root: string = PLUGIN_ROOT): string | null {
    try {
        return parseVersion(readFileSync(join(root, 'herdr-plugin.toml'), 'utf8'));
    } catch {
        return null;
    }
}
