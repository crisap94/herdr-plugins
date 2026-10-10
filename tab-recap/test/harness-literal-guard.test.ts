import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BACKEND_IDS } from '#src/recap/domain/backend.ts';
import { REGISTERED_KINDS } from '#src/recap/domain/registered-kinds.ts';

const RULE = readFileSync(new URL('../rules/recap-no-harness-literals.yml', import.meta.url), 'utf8');

function ruleHarnessIdBranches(): string[][] {
    return RULE.split('\n')
        .filter((line) => line.includes('regex:'))
        .map((line) => line.match(/\(([a-z|]+)\)/)?.[1]?.split('|').toSorted() ?? []);
}

test('the guard rule names every registered kind and every backend id in both of its branches, and nothing else', () => {
    const known = [...new Set<string>([...Object.keys(REGISTERED_KINDS), ...BACKEND_IDS])].toSorted();
    const branches = ruleHarnessIdBranches();
    assert.equal(branches.length, 2, 'the rule has one harness id alternation per regex: the string branch and the template branch');
    for (const branch of branches) {
        assert.deepEqual(branch, known);
    }
});
