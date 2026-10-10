import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { driftOf, MANIFEST_PATH, manifestEntries, manifestText } from '../bin/protocol-manifest.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('MANIFEST lists the protocol files and vectors with their SHA-256, and matches a fresh regeneration', () => {
    const committed = readFileSync(join(ROOT, MANIFEST_PATH), 'utf8');
    const fresh = manifestText(manifestEntries(ROOT));
    assert.deepEqual(driftOf(committed, fresh), [], 'files whose entry in MANIFEST is missing or differs');
});

test('MANIFEST covers every file under src/protocol and protocol/vectors, and nothing else', () => {
    const paths = manifestEntries(ROOT).map((entry) => entry.path);
    assert.ok(paths.includes('protocol/vectors/compact.json'));
    assert.ok(paths.includes('protocol/vectors/kinds.json'));
    assert.ok(paths.includes('src/protocol/exchanges/compact.ts'));
    assert.deepEqual(paths.filter((path) => !path.startsWith('src/protocol/') && !path.startsWith('protocol/vectors/')), []);
});
