import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KINDS_VERSION } from '#src/protocol/kinds.ts';
import { REGISTERED_KINDS } from '#src/recap/domain/registered-kinds.ts';

const PUBLISHED_KINDS: Readonly<Record<number, readonly string[]>> = {
    1: ['claude', 'codex', 'opencode', 'hermes'],
};

const VECTORS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'protocol', 'vectors');

const kindsVector = JSON.parse(readFileSync(join(VECTORS_DIR, 'kinds.json'), 'utf8')) as { readonly version: number; readonly kinds: readonly string[] };

test('the vectors list the registered agent kinds', () => {
    assert.deepEqual(kindsVector.kinds, Object.keys(REGISTERED_KINDS));
});

test('the vectors carry the protocol kinds version', () => {
    assert.equal(kindsVector.version, KINDS_VERSION);
});

test('a kinds version publishes the list it was released with: a kind added without raising the version fails', () => {
    assert.deepEqual(Object.keys(REGISTERED_KINDS), PUBLISHED_KINDS[KINDS_VERSION]);
});
