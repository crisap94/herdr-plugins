import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BACKEND_IDS } from '#src/recap/domain/backend.ts';
import { REGISTERED_KINDS } from '#src/recap/domain/registered-kinds.ts';

const RULE = readFileSync(new URL('../rules/recap-no-harness-literals.yml', import.meta.url), 'utf8');

function ruleHarnessIds(): string[] {
    const regex = RULE.split('\n').find((line) => line.includes('regex:'));
    const alternation = regex?.match(/\(([a-z|]+)\)/)?.[1];
    assert.ok(alternation !== undefined, 'the rule has a harness id alternation in its first regex');
    return alternation.split('|').toSorted();
}

test('the guard rule names every registered kind and every backend id, and nothing else', () => {
    const known = [...new Set<string>([...Object.keys(REGISTERED_KINDS), ...BACKEND_IDS])].toSorted();
    assert.deepEqual(ruleHarnessIds(), known);
});
