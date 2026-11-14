import { readFileSync } from 'node:fs';
import type { Facts } from '../wire/view/connection.ts';

const VERSION_LINE = /^version\s*=\s*"(\d+\.\d+\.\d+)"/mu;

export function readDiskVersion(pluginRoot: URL): Pick<Facts, 'diskVersion'> {
    try {
        return { diskVersion: VERSION_LINE.exec(readFileSync(new URL('herdr-plugin.toml', pluginRoot), 'utf8'))?.[1] ?? null };
    } catch {
        return { diskVersion: null };
    }
}
