import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyEntries, parseEntries, parseEntry, releasedMigrations, type Entry } from '../bin/domain-exceptions.ts';
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

test('the brand exception covers the one cast inside the brand function of brand.ts and no other assertion', () => {
    const brand: Entry = { class: 'brand', file: 'src/recap/domain/brand.ts', function: 'brand', parameter: null, reason: 'the one brand function casts its carrier' };
    const cast = finding({ file: 'src/recap/domain/brand.ts', category: 'assertion', owner: 'brand', parameter: null, site: 'type assertion' });
    const stray = finding({ file: 'src/recap/domain/brand.ts', category: 'assertion', owner: 'other', parameter: null, site: 'type assertion' });
    assert.deepEqual(applyEntries([cast, stray], [brand], []), { findings: [stray], stale: [] });
});

test('a callback exception never covers an assertion', () => {
    const entry: Entry = { class: 'callback', file: 'src/domain/value.ts', function: 'echo', parameter: null, reason: 'a Node callback' };
    const cast = finding({ category: 'assertion', parameter: null, site: 'type assertion' });
    assert.deepEqual(applyEntries([cast], [entry], []).findings, [cast]);
});

test('the released migrations are the files of the latest release tag, not the registry and not newer files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'released-'));
    try {
        const git = (...args: readonly string[]): string => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.test', ...args], { cwd: dir, encoding: 'utf8' });
        git('init', '-q', '-b', 'main');
        mkdirSync(join(dir, 'src/adapters/db/schema'), { recursive: true });
        writeFileSync(join(dir, 'src/adapters/db/schema/001-initial.ts'), 'export const a = 1;\n');
        writeFileSync(join(dir, 'src/adapters/db/schema/index.ts'), 'export const b = 1;\n');
        git('add', '.');
        git('commit', '-q', '-m', 'one');
        assert.deepEqual(releasedMigrations(dir), { kind: 'ok', value: [] });
        git('tag', 'tab-recap-v1.0.0');
        writeFileSync(join(dir, 'src/adapters/db/schema/002-later.ts'), 'export const c = 1;\n');
        git('add', '.');
        git('commit', '-q', '-m', 'two');
        assert.deepEqual(releasedMigrations(dir), { kind: 'ok', value: ['src/adapters/db/schema/001-initial.ts'] });
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

const wire: Entry = {
    class: 'wire',
    file: 'src/wire/view/protocol.ts',
    symbol: 'Hello',
    field: 'cols',
    reason: 'a plain field of the approved view wire contract',
};

const wireFinding = (overrides: Partial<Finding>): Finding =>
    finding({ file: 'src/wire/view/protocol.ts', category: 'property', owner: 'Hello', parameter: null, site: 'property cols', reason: 'resolves to number', ...overrides });

test('a wire entry names a file, a symbol, a field and a reason', () => {
    assert.deepEqual(parseEntry(wire), { kind: 'ok', value: wire });
});

test('a wire entry without a symbol, a field or a reason is refused', () => {
    assert.equal(parseEntry({ ...wire, symbol: '' }).kind, 'err');
    assert.equal(parseEntry({ ...wire, field: undefined }).kind, 'err');
    assert.equal(parseEntry({ ...wire, reason: '' }).kind, 'err');
});

test('a wire exception covers the property finding of its symbol and field, and no other field or symbol', () => {
    const rows = wireFinding({ site: 'property rows' });
    const resize = wireFinding({ owner: 'Resize' });
    assert.deepEqual(applyEntries([wireFinding({}), rows, resize], [wire], []), { findings: [rows, resize], stale: [] });
});

test('a wire exception covers a container finding of a property, of a parameter and of a return', () => {
    const lines: Entry = { ...wire, file: 'src/wire/view/paint.ts', symbol: 'paintOf', field: 'lines' };
    const returned: Entry = { ...wire, file: 'src/wire/view/codec.ts', symbol: 'push', field: 'return' };
    const frame: Entry = { ...wire, symbol: 'FrameMessage', field: 'lines' };
    const findings = [
        wireFinding({ file: 'src/wire/view/paint.ts', category: 'container', owner: 'paintOf', parameter: 'lines', site: 'parameter lines' }),
        wireFinding({ file: 'src/wire/view/codec.ts', category: 'container', owner: 'push', site: 'return' }),
        wireFinding({ category: 'container', owner: 'FrameMessage', site: 'property lines' }),
    ];
    assert.deepEqual(applyEntries(findings, [lines, returned, frame], []), { findings: [], stale: [] });
});

test('a wire exception never covers a parameter, a return or an assertion finding', () => {
    const entry: Entry = { ...wire, file: 'src/wire/view/codec.ts', symbol: 'decodeClient', field: 'line' };
    const parameter = wireFinding({ file: 'src/wire/view/codec.ts', category: 'parameter', owner: 'decodeClient', parameter: 'line', site: 'parameter line' });
    const returned = wireFinding({ file: 'src/wire/view/codec.ts', category: 'return', owner: 'decodeClient', site: 'return' });
    const cast = wireFinding({ file: 'src/wire/view/codec.ts', category: 'assertion', owner: 'decodeClient', site: 'type assertion' });
    const outcome = applyEntries([parameter, returned, cast], [entry], []);
    assert.deepEqual(outcome.findings, [parameter, returned, cast]);
    assert.deepEqual(outcome.stale, ['not supported: exception src/wire/view/codec.ts decodeClient line matches no finding']);
});

test('a wire exception outside src/wire/ is stale and excepts nothing', () => {
    const entry: Entry = { ...wire, file: 'src/domain/value.ts', symbol: 'Size', field: 'width' };
    const hit = finding({ category: 'property', owner: 'Size', parameter: null, site: 'property width' });
    assert.deepEqual(applyEntries([hit], [entry], []), {
        findings: [hit],
        stale: ['not supported: exception src/domain/value.ts Size width is not under src/wire/'],
    });
});

test('a wire exception matching no finding is stale, and the stale line begins not supported', () => {
    assert.deepEqual(applyEntries([], [wire], []).stale, ['not supported: exception src/wire/view/protocol.ts Hello cols matches no finding']);
});

test('a callback exception never covers a property or a container finding', () => {
    const entry: Entry = { class: 'callback', file: 'src/wire/view/protocol.ts', function: 'Hello', parameter: null, reason: 'a Node callback' };
    const property = wireFinding({});
    const container = wireFinding({ category: 'container', owner: 'FrameMessage', site: 'property lines' });
    assert.deepEqual(applyEntries([property, container], [entry], []).findings, [property, container]);
});
