import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

const SYNCED = [
    'graph.sh',
    'depcruise-verdict.ts',
    'rules.sh',
    'rules-bite.sh',
    'verify-bite.sh',
    'domain-types.sh',
    'test.sh',
    'check-boundaries.ts',
    'bin/check-domain-types.ts',
    'bin/domain-findings.ts',
    'bin/domain-syntax.ts',
    'bin/domain-exceptions.ts',
    'bin/domain-report.ts',
    'bin/domain-baseline.ts',
    'bin/lane-map.ts',
    'bin/result.ts',
] as const;

const repository = join(dirname(new URL(import.meta.url).pathname), '..', '..');

function unitsOf(root: string): readonly string[] {
    return ['.', 'packages']
        .filter((parent) => existsSync(join(root, parent)))
        .flatMap((parent) => readdirSync(join(root, parent)).map((name) => (parent === '.' ? name : `${parent}/${name}`)))
        .filter((unit) => existsSync(join(root, unit, 'gates', 'config.json')))
        .toSorted();
}

function driftOf(root: string, units: readonly string[]): readonly string[] {
    const [reference] = units;
    if (reference === undefined) {
        return ['no unit holds gates/config.json'];
    }
    return SYNCED.flatMap((file) => {
        const path = (unit: string): string => join(root, unit, 'gates', file);
        if (!existsSync(path(reference))) {
            return [`${reference}/gates/${file} is missing`];
        }
        const text = readFileSync(path(reference), 'utf8');
        return units.slice(1).flatMap((unit) => {
            if (!existsSync(path(unit))) {
                return [`${unit}/gates/${file} is missing`];
            }
            return readFileSync(path(unit), 'utf8') === text ? [] : [`${unit}/gates/${file} differs from ${reference}/gates/${file}`];
        });
    });
}

function scratchTree(change: (root: string) => void): readonly string[] {
    const root = mkdtempSync(join(tmpdir(), 'gates-in-sync-'));
    try {
        ['packages/a', 'packages/b'].forEach((unit) => {
            SYNCED.forEach((file) => {
                mkdirSync(dirname(join(root, unit, 'gates', file)), { recursive: true });
                writeFileSync(join(root, unit, 'gates', file), `${file}\n`);
            });
            writeFileSync(join(root, unit, 'gates', 'config.json'), `{"unit": "${unit}"}\n`);
        });
        change(root);
        return driftOf(root, unitsOf(root));
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
}

test('the three packages are units: each holds gates/config.json', () => {
    const units = unitsOf(repository);
    ['packages/recap-view', 'packages/session-ledger', 'packages/session-ledger-sqlite'].forEach((unit) => assert.ok(units.includes(unit), `${unit} has no gates/config.json`));
});

test('every SYNCED runner file is present and byte-identical in every unit', () => {
    assert.deepEqual(driftOf(repository, unitsOf(repository)), []);
});

test('a scratch file in one unit and a differing config.json are not drift', () => {
    assert.deepEqual(scratchTree((root) => writeFileSync(join(root, 'packages/a/gates/scratch.sh'), 'echo scratch\n')), []);
});

test('a changed or a missing SYNCED file is drift', () => {
    assert.deepEqual(scratchTree((root) => writeFileSync(join(root, 'packages/b/gates/rules.sh'), 'changed\n')), ['packages/b/gates/rules.sh differs from packages/a/gates/rules.sh']);
    assert.deepEqual(scratchTree((root) => rmSync(join(root, 'packages/b/gates/bin/result.ts'))), ['packages/b/gates/bin/result.ts is missing']);
});
