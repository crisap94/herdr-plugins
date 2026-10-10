import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION_LINE = /^version\s*=\s*"(\d+\.\d+\.\d+)"\s*(?:#.*)?$/;

export function parseVersion(toml: string): string | null {
    for (const line of toml.split('\n')) {
        const found = VERSION_LINE.exec(line.trim());
        if (found !== null) {
            return found[1] ?? null;
        }
    }
    return null;
}

export function shouldRoll(started: string | null, current: string | null, seenBefore: string | null): boolean {
    return started !== null && current !== null && current !== started && seenBefore === current;
}

const PLUGIN_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

export function codeVersion(root: string = PLUGIN_ROOT): string | null {
    try {
        return parseVersion(readFileSync(join(root, 'herdr-plugin.toml'), 'utf8'));
    } catch {
        return null;
    }
}
