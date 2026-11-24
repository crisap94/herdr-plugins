import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyEntries, parseEntries, parseEntry, releasedMigrations, type Entry, type Rules } from '../gates/bin/domain-exceptions.ts';
import { categoryIn, compareFindings, type Finding } from '../gates/bin/domain-findings.ts';
import { parseSettings, settingsOf } from '../gates/bin/domain-report.ts';

const PLUGIN: Rules = { brandFile: 'src/recap/domain/brand.ts', contractFolders: ['src/wire/'], callbackContainers: true };
const MIGRATIONS = { dir: 'src/adapters/db/schema', tags: 'tab-recap-v*' };

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
    const outcome = applyEntries([], [callback], [], PLUGIN);
    assert.deepEqual(outcome.stale, ['not supported: exception src/domain/value.ts echo value matches no finding']);
});

test('an exception matching its finding removes that finding and leaves the others', () => {
    const other = finding({ parameter: 'other', site: 'parameter other' });
    const outcome = applyEntries([finding({}), other], [callback], [], PLUGIN);
    assert.deepEqual(outcome, { findings: [other], stale: [] });
});

test('a migration exception names a released migration file, or it is stale', () => {
    const migration: Entry = { class: 'migration', file: 'src/adapters/db/schema/001-initial.ts', reason: 'released' };
    const hit = finding({ file: 'src/adapters/db/schema/001-initial.ts', owner: 'column', parameter: 'name', site: 'parameter name' });
    assert.deepEqual(applyEntries([hit], [migration], ['src/adapters/db/schema/001-initial.ts'], PLUGIN), { findings: [], stale: [] });
    assert.deepEqual(applyEntries([hit], [migration], [], PLUGIN).findings, [hit]);
    assert.deepEqual(applyEntries([hit], [migration], [], PLUGIN).stale, [
        'not supported: exception src/adapters/db/schema/001-initial.ts names no released migration',
    ]);
});

test('a brand exception outside brand.ts is stale and excepts nothing', () => {
    const brand: Entry = { class: 'brand', file: 'src/domain/value.ts', function: 'echo', parameter: 'value', reason: 'brand' };
    const outcome = applyEntries([finding({})], [brand], [], PLUGIN);
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
    assert.deepEqual(applyEntries([cast, stray], [brand], [], PLUGIN), { findings: [stray], stale: [] });
});

test('a callback exception never covers an assertion', () => {
    const entry: Entry = { class: 'callback', file: 'src/domain/value.ts', function: 'echo', parameter: null, reason: 'a Node callback' };
    const cast = finding({ category: 'assertion', parameter: null, site: 'type assertion' });
    assert.deepEqual(applyEntries([cast], [entry], [], PLUGIN).findings, [cast]);
});

test('a callback exception covers the container finding of its parameter and of its return, never an assertion', () => {
    const parameter: Entry = { class: 'callback', file: 'src/domain/value.ts', function: 'echo', parameter: 'sizes', reason: 'a Node callback' };
    const returned: Entry = { ...parameter, parameter: null };
    const containerParameter = finding({ category: 'container', parameter: 'sizes', site: 'parameter sizes' });
    const containerReturn = finding({ category: 'container', parameter: null, site: 'return' });
    const assertion = finding({ category: 'assertion', parameter: null, site: 'type assertion' });
    assert.deepEqual(applyEntries([containerParameter, containerReturn, assertion], [parameter, returned], [], PLUGIN), {
        findings: [assertion],
        stale: [],
    });
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
        assert.deepEqual(releasedMigrations(dir, MIGRATIONS), { kind: 'ok', value: [] });
        git('tag', 'tab-recap-v1.0.0');
        writeFileSync(join(dir, 'src/adapters/db/schema/002-later.ts'), 'export const c = 1;\n');
        git('add', '.');
        git('commit', '-q', '-m', 'two');
        assert.deepEqual(releasedMigrations(dir, MIGRATIONS), { kind: 'ok', value: ['src/adapters/db/schema/001-initial.ts'] });
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

const contract: Entry = {
    class: 'contract',
    file: 'src/wire/view/protocol.ts',
    symbol: 'Hello',
    field: 'cols',
    reason: 'a plain field of the approved view wire contract',
};

const contractFinding = (overrides: Partial<Finding>): Finding =>
    finding({ file: 'src/wire/view/protocol.ts', category: 'property', owner: 'Hello', parameter: null, site: 'property cols', reason: 'resolves to number', ...overrides });

test('a contract entry names a file, a symbol, a field and a reason', () => {
    assert.deepEqual(parseEntry(contract), { kind: 'ok', value: contract });
});

test('a contract entry without a symbol, a field or a reason is refused', () => {
    assert.equal(parseEntry({ ...contract, symbol: '' }).kind, 'err');
    assert.equal(parseEntry({ ...contract, field: undefined }).kind, 'err');
    assert.equal(parseEntry({ ...contract, reason: '' }).kind, 'err');
});

test('a contract exception covers the property finding of its symbol and field, and no other field or symbol', () => {
    const rows = contractFinding({ site: 'property rows' });
    const resize = contractFinding({ owner: 'Resize' });
    assert.deepEqual(applyEntries([contractFinding({}), rows, resize], [contract], [], PLUGIN), { findings: [rows, resize], stale: [] });
});

test('a contract exception covers a container finding of a property, of a parameter and of a return', () => {
    const lines: Entry = { ...contract, file: 'src/wire/view/paint.ts', symbol: 'paintOf', field: 'lines' };
    const returned: Entry = { ...contract, file: 'src/wire/view/codec.ts', symbol: 'push', field: 'return' };
    const frame: Entry = { ...contract, symbol: 'FrameMessage', field: 'lines' };
    const findings = [
        contractFinding({ file: 'src/wire/view/paint.ts', category: 'container', owner: 'paintOf', parameter: 'lines', site: 'parameter lines' }),
        contractFinding({ file: 'src/wire/view/codec.ts', category: 'container', owner: 'push', site: 'return' }),
        contractFinding({ category: 'container', owner: 'FrameMessage', site: 'property lines' }),
    ];
    assert.deepEqual(applyEntries(findings, [lines, returned, frame], [], PLUGIN), { findings: [], stale: [] });
});

test('a contract exception covers the parameter finding of its function and parameter, and no other parameter or function', () => {
    const entry: Entry = { ...contract, file: 'src/wire/view/paint.ts', symbol: 'paintOf', field: 'title' };
    const title = contractFinding({ file: 'src/wire/view/paint.ts', category: 'parameter', owner: 'paintOf', parameter: 'title', site: 'parameter title' });
    const colour = contractFinding({ file: 'src/wire/view/paint.ts', category: 'parameter', owner: 'paintOf', parameter: 'colour', site: 'parameter colour' });
    const enter = contractFinding({ file: 'src/wire/view/paint.ts', category: 'parameter', owner: 'ENTER', parameter: 'title', site: 'parameter title' });
    assert.deepEqual(applyEntries([title, colour, enter], [entry], [], PLUGIN), { findings: [colour, enter], stale: [] });
});

test('a contract exception names a return by the field return and covers only the return finding of its function', () => {
    const entry: Entry = { ...contract, file: 'src/wire/paths.ts', symbol: 'viewSocketPath', field: 'return' };
    const returned = contractFinding({ file: 'src/wire/paths.ts', category: 'return', owner: 'viewSocketPath', site: 'return' });
    const parameter = contractFinding({ file: 'src/wire/paths.ts', category: 'parameter', owner: 'viewSocketPath', parameter: 'stateDir', site: 'parameter stateDir' });
    const other = contractFinding({ file: 'src/wire/paths.ts', category: 'return', owner: 'hooksSocketPath', site: 'return' });
    assert.deepEqual(applyEntries([returned, parameter, other], [entry], [], PLUGIN), { findings: [parameter, other], stale: [] });
});

test('a contract exception never covers an assertion finding', () => {
    const entry: Entry = { ...contract, file: 'src/wire/view/codec.ts', symbol: 'decodeClient', field: 'line' };
    const cast = contractFinding({ file: 'src/wire/view/codec.ts', category: 'assertion', owner: 'decodeClient', parameter: 'line', site: 'type assertion' });
    const outcome = applyEntries([cast], [entry], [], PLUGIN);
    assert.deepEqual(outcome.findings, [cast]);
    assert.deepEqual(outcome.stale, ['not supported: exception src/wire/view/codec.ts decodeClient line matches no finding']);
});

test('a contract exception for a parameter the function does not have is stale and excepts nothing', () => {
    const entry: Entry = { ...contract, file: 'src/wire/view/codec.ts', symbol: 'decodeClient', field: 'text' };
    const line = contractFinding({ file: 'src/wire/view/codec.ts', category: 'parameter', owner: 'decodeClient', parameter: 'line', site: 'parameter line' });
    assert.deepEqual(applyEntries([line], [entry], [], PLUGIN), {
        findings: [line],
        stale: ['not supported: exception src/wire/view/codec.ts decodeClient text matches no finding'],
    });
});

test('a contract exception for a parameter or a return outside src/wire/ is stale and excepts nothing', () => {
    const parameter: Entry = { ...contract, file: 'src/domain/value.ts', symbol: 'echo', field: 'value' };
    const returned: Entry = { ...contract, file: 'src/domain/value.ts', symbol: 'echo', field: 'return' };
    const hits = [finding({}), finding({ category: 'return', parameter: null, site: 'return' })];
    assert.deepEqual(applyEntries(hits, [parameter, returned], [], PLUGIN), {
        findings: hits,
        stale: [
            'not supported: exception src/domain/value.ts echo value is not under src/wire/',
            'not supported: exception src/domain/value.ts echo return is not under src/wire/',
        ],
    });
});

test('a callback exception under src/wire/ still covers its parameter and its return', () => {
    const parameter: Entry = { class: 'callback', file: 'src/wire/paths.ts', function: 'viewSocketPath', parameter: 'stateDir', reason: 'a Node callback' };
    const returned: Entry = { ...parameter, parameter: null };
    const hits = [
        contractFinding({ file: 'src/wire/paths.ts', category: 'parameter', owner: 'viewSocketPath', parameter: 'stateDir', site: 'parameter stateDir' }),
        contractFinding({ file: 'src/wire/paths.ts', category: 'return', owner: 'viewSocketPath', site: 'return' }),
    ];
    assert.deepEqual(applyEntries(hits, [parameter, returned], [], PLUGIN), { findings: [], stale: [] });
});

test('a contract exception outside src/wire/ is stale and excepts nothing', () => {
    const entry: Entry = { ...contract, file: 'src/domain/value.ts', symbol: 'Size', field: 'width' };
    const hit = finding({ category: 'property', owner: 'Size', parameter: null, site: 'property width' });
    assert.deepEqual(applyEntries([hit], [entry], [], PLUGIN), {
        findings: [hit],
        stale: ['not supported: exception src/domain/value.ts Size width is not under src/wire/'],
    });
});

test('a contract exception matching no finding is stale, and the stale line begins not supported', () => {
    assert.deepEqual(applyEntries([], [contract], [], PLUGIN).stale, ['not supported: exception src/wire/view/protocol.ts Hello cols matches no finding']);
});

test('a callback exception never covers a property or a container finding', () => {
    const entry: Entry = { class: 'callback', file: 'src/wire/view/protocol.ts', function: 'Hello', parameter: null, reason: 'a Node callback' };
    const property = contractFinding({});
    const container = contractFinding({ category: 'container', owner: 'FrameMessage', site: 'property lines' });
    assert.deepEqual(applyEntries([property, container], [entry], [], PLUGIN).findings, [property, container]);
});

const DEFAULT_RULES: Rules = { brandFile: null, contractFolders: ['src/contract/', 'src/compaction-timing/'], callbackContainers: false };

test('the default contract folders are src/contract/ and src/compaction-timing/; the plugin names src/wire/', () => {
    const inContract = contractFinding({ file: 'src/contract/view.ts' });
    const entry: Entry = { ...contract, file: 'src/contract/view.ts' };
    assert.deepEqual(applyEntries([inContract], [entry], [], DEFAULT_RULES), { findings: [], stale: [] });
    assert.deepEqual(applyEntries([inContract], [entry], [], PLUGIN).stale, [
        'not supported: exception src/contract/view.ts Hello cols is not under src/wire/',
    ]);
    const timing: Entry = { ...contract, file: 'src/compaction-timing/clock.ts' };
    assert.deepEqual(applyEntries([contractFinding({ file: 'src/compaction-timing/clock.ts' })], [timing], [], DEFAULT_RULES), { findings: [], stale: [] });
    assert.deepEqual(applyEntries([], [contract], [], DEFAULT_RULES).stale, [
        'not supported: exception src/wire/view/protocol.ts Hello cols is not under src/contract/ or src/compaction-timing/',
    ]);
});

test('a callback exception covers a container finding only where callbackContainers is on', () => {
    const entry: Entry = { class: 'callback', file: 'src/domain/value.ts', function: 'echo', parameter: 'sizes', reason: 'a Node callback' };
    const container = finding({ category: 'container', parameter: 'sizes', site: 'parameter sizes' });
    assert.deepEqual(applyEntries([container], [entry], [], PLUGIN), { findings: [], stale: [] });
    assert.deepEqual(applyEntries([container], [entry], [], DEFAULT_RULES), {
        findings: [container],
        stale: ['not supported: exception src/domain/value.ts echo sizes matches no finding'],
    });
});

test('the settings default to the package rules and take the plugin values from gates/config.json', () => {
    assert.deepEqual(parseSettings({}), {
        kind: 'ok',
        value: {
            brandFile: null,
            extraBrandFiles: [],
            exceptions: 'gates/domain-types-exceptions.json',
            migrations: null,
            inheritBaseline: null,
            contractFolders: ['src/contract/', 'src/compaction-timing/'],
            callbackContainers: false,
        },
    });
    const dir = mkdtempSync(join(tmpdir(), 'settings-'));
    try {
        mkdirSync(join(dir, 'gates'));
        writeFileSync(join(dir, 'gates', 'config.json'), JSON.stringify({ contractFolders: ['src/wire/'], callbackContainers: true, extraBrandFiles: ['packages/a/src/kernel.ts'] }));
        const settings = settingsOf(dir);
        assert.equal(settings.kind, 'ok');
        assert.deepEqual([settings.value.contractFolders, settings.value.callbackContainers, settings.value.extraBrandFiles], [
            ['src/wire/'],
            true,
            ['packages/a/src/kernel.ts'],
        ]);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
