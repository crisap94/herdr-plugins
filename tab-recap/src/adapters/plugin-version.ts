// The plugin's own version: the one line `version = "x.y.z"` of herdr-plugin.toml, next to the code. Read-only.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION_LINE = /^version\s*=\s*"(\d+\.\d+\.\d+)"\s*(?:#.*)?$/;

/** A strict line match, no TOML parser; the first line that matches wins, anything else is null. */
export function parseVersion(toml: string): string | null {
    for (const line of toml.split('\n')) {
        const found = VERSION_LINE.exec(line.trim());
        if (found !== null) {
            return found[1] ?? null;
        }
    }
    return null;
}

/** The plugin root: two levels above `src/adapters/`. */
const PLUGIN_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

/** The version of the code on disk; null when the manifest cannot be read or says none. */
export function codeVersion(root: string = PLUGIN_ROOT): string | null {
    try {
        return parseVersion(readFileSync(join(root, 'herdr-plugin.toml'), 'utf8'));
    } catch {
        return null;
    }
}
