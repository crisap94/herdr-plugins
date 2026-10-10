import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MANIFEST_PATH = 'protocol/MANIFEST';
export const COVERED_DIRS: readonly string[] = ['src/protocol', 'protocol/vectors'];

export interface ManifestEntry {
    readonly path: string;
    readonly sha256: string;
}

const LINE = /^([0-9a-f]{64}) {2}(.+)$/;

const filesUnder = (root: string, dir: string): readonly string[] =>
    readdirSync(join(root, dir), { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => relative(root, join(entry.parentPath, entry.name)));

const sha256Of = (root: string, path: string): string => createHash('sha256').update(readFileSync(join(root, path))).digest('hex');

export function manifestEntries(root: string): readonly ManifestEntry[] {
    return COVERED_DIRS.flatMap((dir) => filesUnder(root, dir))
        .toSorted()
        .map((path) => ({ path, sha256: sha256Of(root, path) }));
}

export const manifestText = (entries: readonly ManifestEntry[]): string =>
    entries.map((entry) => `${entry.sha256}  ${entry.path}\n`).join('');

const digestsByPath = (text: string): ReadonlyMap<string, string> =>
    new Map(text.split('\n').flatMap((line) => {
        const match = LINE.exec(line);
        return match?.[1] === undefined || match[2] === undefined ? [] : [[match[2], match[1]] as const];
    }));

export function driftOf(committed: string, fresh: string): readonly string[] {
    const before = digestsByPath(committed);
    const after = digestsByPath(fresh);
    return [...new Set([...before.keys(), ...after.keys()])]
        .filter((path) => before.get(path) !== after.get(path))
        .toSorted();
}

function main(argv: readonly string[], root: string): number {
    const fresh = manifestText(manifestEntries(root));
    const path = join(root, MANIFEST_PATH);
    if (!argv.includes('--check')) {
        writeFileSync(path, fresh);
        console.log(`wrote ${MANIFEST_PATH}`);
        return 0;
    }
    const drift = driftOf(existsSync(path) ? readFileSync(path, 'utf8') : '', fresh);
    if (drift.length === 0) {
        console.log(`${MANIFEST_PATH}: clean`);
        return 0;
    }
    for (const file of drift) {
        console.error(`${MANIFEST_PATH}: drift in ${file}`);
    }
    console.error(`${MANIFEST_PATH}: 1 — regenerate with bin/protocol-manifest.ts and commit it`);
    return 1;
}

if (import.meta.main) {
    process.exitCode = main(process.argv.slice(2), join(dirname(fileURLToPath(import.meta.url)), '..'));
}
