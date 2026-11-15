import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { checkBoundaries, type Boundaries } from '../../gates/check-boundaries.ts';

const BOUNDARIES: Boundaries = {
    source: ['src', 'test', 'testkit', 'gates'],
    domain: 'src',
    builtins: ['node:util'],
    declaredAhead: [],
    dependencies: [],
    units: ['recap-view'],
};

function findingsFor(files: Readonly<Record<string, string>>, boundaries: Boundaries = BOUNDARIES): readonly string[] {
    const root = mkdtempSync(join(tmpdir(), 'check-boundaries-'));
    try {
        Object.entries(files).forEach(([file, text]) => {
            mkdirSync(dirname(join(root, file)), { recursive: true });
            writeFileSync(join(root, file), text);
        });
        return checkBoundaries(root, boundaries);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
}

test('a node:fs import in testkit/ passes, the same import in src/ fails', () => {
    const line = "import { readFileSync } from 'node:fs';\nexport const read = readFileSync;\n";
    assert.deepEqual(findingsFor({ 'testkit/index.ts': line }), []);
    assert.deepEqual(findingsFor({ 'src/index.ts': line }), ['src/index.ts: node:fs is not an allowed built-in of src/ (gates/config.json builtins)']);
});

test('an allowed built-in passes in src/', () => {
    assert.deepEqual(findingsFor({ 'src/index.ts': "import { inspect } from 'node:util';\nexport const show = inspect;\n" }), []);
});

test('a relative import that leaves the package root fails in every source folder', () => {
    assert.deepEqual(findingsFor({ 'test/a.test.ts': "import '../../outside.ts';\n" }), ['test/a.test.ts: ../../outside.ts leaves the package root']);
});

test("a specifier into another unit's src/ fails in every source folder", () => {
    assert.deepEqual(findingsFor({ 'testkit/index.ts': "export * from '@stateforge-labs/recap-view/src/index.ts';\n" }), [
        "testkit/index.ts: @stateforge-labs/recap-view/src/index.ts reaches into the src/ of recap-view",
    ]);
});

test('a bare import in src/ must be a dependency', () => {
    assert.deepEqual(findingsFor({ 'src/index.ts': "import { sql } from 'drizzle-orm';\nexport const raw = sql;\n" }), [
        'src/index.ts: drizzle-orm is not in the dependencies of package.json',
    ]);
    assert.deepEqual(findingsFor({ 'test/a.test.ts': "import { sql } from 'drizzle-orm';\nexport const raw = sql;\n" }), []);
});

test('a dependency src/ never imports must be declared ahead, and leaves declaredAhead once imported', () => {
    const declared: Boundaries = { ...BOUNDARIES, dependencies: ['drizzle-orm'] };
    assert.deepEqual(findingsFor({ 'src/index.ts': 'export {};\n' }, declared), [
        'package.json: dependency drizzle-orm is never imported by src/ and is not in declaredAhead',
    ]);
    assert.deepEqual(findingsFor({ 'src/index.ts': 'export {};\n' }, { ...declared, declaredAhead: ['drizzle-orm'] }), []);
    assert.deepEqual(findingsFor({ 'src/index.ts': "import { sql } from 'drizzle-orm';\nexport const raw = sql;\n" }, { ...declared, declaredAhead: ['drizzle-orm'] }), [
        'gates/config.json: declaredAhead lists drizzle-orm, which src/ imports: remove it',
    ]);
});
