import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyEntries, parseEntries, parseEntry, type Entry } from '../bin/domain-exceptions.ts';
import { categoryIn, compareFindings, type Finding } from '../bin/domain-findings.ts';

const finding = (overrides: Partial<Finding>): Finding => ({
    file: 'src/domain/value.ts',
    line: 1,
    category: 'parameter',
    owner: 'echo',
    parameter: 'value',
    site: 'parameter value',
    reason: 'resolves to string',
    ...overrides,
});

const callback: Entry = {
    class: 'callback',
    file: 'src/domain/value.ts',
    function: 'echo',
    parameter: 'value',
    reason: 'a Node callback',
};

test('an entry names a file, a function, a parameter or null for a return, and a reason', () => {
    assert.deepEqual(parseEntry(callback), { kind: 'ok', value: callback });
});

test('an entry without a reason, or of an unknown class, is refused', () => {
    assert.equal(parseEntry({ ...callback, reason: '' }).kind, 'err');
    assert.equal(parseEntry({ ...callback, class: 'lane' }).kind, 'err');
});

test('a file that is not a JSON array is refused', () => {
    assert.equal(parseEntries({ class: 'callback' }).kind, 'err');
});

test('an exception matching no finding is stale, and the stale line begins not supported', () => {
    const outcome = applyEntries([], [callback], []);
    assert.deepEqual(outcome.stale, ['not supported: exception src/domain/value.ts echo value matches no finding']);
});

test('an exception matching its finding removes that finding and leaves the others', () => {
    const other = finding({ parameter: 'other', site: 'parameter other' });
    const outcome = applyEntries([finding({}), other], [callback], []);
    assert.deepEqual(outcome, { findings: [other], stale: [] });
});

test('a migration exception names a released migration file, or it is stale', () => {
    const migration: Entry = { class: 'migration', file: 'src/adapters/db/schema/001-initial.ts', reason: 'released' };
    const hit = finding({ file: 'src/adapters/db/schema/001-initial.ts', owner: 'column', parameter: 'name', site: 'parameter name' });
    assert.deepEqual(applyEntries([hit], [migration], ['src/adapters/db/schema/001-initial.ts']), { findings: [], stale: [] });
    assert.deepEqual(applyEntries([hit], [migration], []).findings, [hit]);
    assert.deepEqual(applyEntries([hit], [migration], []).stale, [
        'not supported: exception src/adapters/db/schema/001-initial.ts names no released migration',
    ]);
});

test('a brand exception outside brand.ts is stale and excepts nothing', () => {
    const brand: Entry = { class: 'brand', file: 'src/domain/value.ts', function: 'echo', parameter: 'value', reason: 'brand' };
    const outcome = applyEntries([finding({})], [brand], []);
    assert.equal(outcome.findings.length, 1);
    assert.equal(outcome.stale.length, 1);
});

test('findings in legacy.ts are the legacy category', () => {
    assert.equal(categoryIn('src/recap/domain/legacy.ts', 'parameter'), 'legacy');
    assert.equal(categoryIn('src/recap/domain/value.ts', 'parameter'), 'parameter');
});

test('findings sort by file, then line, then category, then site, with plain comparison', () => {
    const sorted = [finding({ line: 2 }), finding({ file: 'src/a.ts' }), finding({ site: 'parameter a' })].toSorted(compareFindings);
    assert.deepEqual(sorted.map((item) => [item.file, item.line, item.site]), [
        ['src/a.ts', 1, 'parameter value'],
        ['src/domain/value.ts', 1, 'parameter a'],
        ['src/domain/value.ts', 2, 'parameter value'],
    ]);
});
