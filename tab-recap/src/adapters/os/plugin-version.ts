import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fsPathOf, type FsPath } from '#src/recap/domain/fs-path.ts';
import { textOf, type Text } from '@stateforge-labs/session-ledger';

type Table = Readonly<Record<string, unknown>>;

const isTable = (value: unknown): value is Table => typeof value === 'object' && value !== null && !Array.isArray(value);

export function parseVersion(toml: Text): Text | null {
    try {
        const parsed: unknown = Bun.TOML.parse(toml);
        const version = isTable(parsed) ? parsed['version'] : undefined;
        return typeof version === 'string' && /^\d+\.\d+\.\d+$/.test(version) ? textOf(version) : null;
    } catch {
        return null;
    }
}

export type Rolling = 'roll' | 'stay';

export function shouldRoll(started: Text | null, current: Text | null, seenBefore: Text | null): Rolling {
    return started !== null && current !== null && current !== started && seenBefore === current ? 'roll' : 'stay';
}

const PLUGIN_ROOT = fsPathOf(dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url))))));

export function codeVersion(root: FsPath = PLUGIN_ROOT): Text | null {
    try {
        return parseVersion(textOf(readFileSync(join(root, 'herdr-plugin.toml'), 'utf8')));
    } catch {
        return null;
    }
}
