import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..', '..');
const PLUGIN = join(ROOT, 'tab-recap');

type Counts = Readonly<Record<string, number>>;

interface Foundation {
    readonly commit: string;
    readonly releaseCommit: string;
    readonly tag: string;
    readonly golden: { readonly one: string; readonly full: string };
    readonly tests: { readonly pass: number; readonly fail: number; readonly files: number };
    readonly lint: { readonly exit: number; readonly ok: number };
    readonly nextRelease: { readonly previous: string; readonly version: string | null; readonly bump: string | null; readonly merged: number };
    readonly domainTypes: Counts;
    readonly engineFiles: Counts;
    readonly lanes: Counts;
}

const foundation = JSON.parse(readFileSync(join(ROOT, 'ci', 'baselines', 'foundation.json'), 'utf8')) as Foundation;

const sha256 = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');

const countsOf = (record: Readonly<Record<string, unknown>>): Record<string, number> =>
    Object.fromEntries(Object.entries(record).map(([key, value]) => [key, Array.isArray(value) ? value.length : -1]));

describe('foundation baselines', () => {
    test('every key of table PL 6.2 is present', () => {
        expect(foundation.commit).toMatch(/^[0-9a-f]{40}$/);
        expect(foundation.releaseCommit).toMatch(/^[0-9a-f]{40}$/);
        expect(foundation.tag).toBe('tab-recap-v3.0.2');
        expect(foundation.golden.one).toMatch(/^[0-9a-f]{64}$/);
        expect(foundation.golden.full).toMatch(/^[0-9a-f]{64}$/);
        expect(Number.isInteger(foundation.tests.pass)).toBe(true);
        expect(Number.isInteger(foundation.tests.fail)).toBe(true);
        expect(Number.isInteger(foundation.tests.files)).toBe(true);
        expect(Number.isInteger(foundation.lint.exit)).toBe(true);
        expect(Number.isInteger(foundation.lint.ok)).toBe(true);
        expect(Object.keys(foundation.nextRelease).toSorted()).toEqual(['bump', 'command', 'merged', 'previous', 'source', 'to', 'version']);
        expect(Number.isInteger(foundation.domainTypes.total)).toBe(true);
        expect(Object.keys(foundation.engineFiles).length).toBeGreaterThan(0);
        expect(Object.keys(foundation.lanes).length).toBeGreaterThan(0);
    });

    test('the domain-type total is the sum of the per-file totals', () => {
        const { total, ...perFile } = foundation.domainTypes;
        expect(Object.values(perFile).reduce((sum, count) => sum + count, 0)).toBe(total ?? -1);
    });

    test('the engine golden fixtures hash to golden.one and golden.full', () => {
        expect(sha256(join(PLUGIN, 'test', 'fixtures', 'engine-golden-one.txt'))).toBe(foundation.golden.one);
        expect(sha256(join(PLUGIN, 'test', 'fixtures', 'engine-golden-full.txt'))).toBe(foundation.golden.full);
    });

    test('the engine manifest has as many entries per key as engineFiles', () => {
        const manifest = JSON.parse(readFileSync(join(PLUGIN, 'ci', 'engine-files.json'), 'utf8')) as Readonly<Record<string, unknown>>;
        expect(countsOf(manifest)).toEqual({ ...foundation.engineFiles });
    });
});
