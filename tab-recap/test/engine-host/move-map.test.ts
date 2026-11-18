import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { ENGINE_FILES_PATH, MOVE_MAP_PATH, PLUGIN_ENGINE_BASELINE_PATH, baselineOf, engineOf, moveMap, packageRowsAbovePlugin, stubOf } from './move-map.ts';
import type { BaselineRows } from './move-map.ts';

const FROM = 'tab-recap/';
const TO = 'packages/session-ledger/';
const LANE_SHAPE_FILES = [
    'src/ports/transcripts.ts',
    'src/recap/application/boundaries.ts',
    'src/recap/application/engine.ts',
    'src/recap/application/lane-hints.ts',
    'src/recap/application/recap-input.ts',
    'src/recap/application/recap-job.ts',
];

const engine = engineOf(JSON.parse(readFileSync(ENGINE_FILES_PATH, 'utf8')));
const rows = moveMap(engine).split('\n').filter((line) => line !== '').map((line) => line.split('\t'));
const moves = rows.filter(([kind]) => kind === 'path');
const repoints = rows.filter(([kind]) => kind === 'text');
const stubs = rows.filter(([kind]) => kind === 'stub');

test('one path row per engine file, and the manifest is the real one', () => {
    assert.ok(engine.length > 0);
    assert.equal(moves.length, engine.length);
    assert.deepEqual(
        moves.map(([, from]) => from),
        engine.map((file) => `${FROM}${file}`),
    );
    assert.deepEqual(
        moves.map(([, , to]) => to),
        engine.map((file) => `${TO}${file}`),
    );
});

test('the text rows re-point the eight import lines and touch only the six files', () => {
    assert.equal(repoints.length, 8);
    assert.deepEqual(
        repoints.map(([, , to]) => to),
        repoints.map(() => '#src/recap/domain/lane-shape.ts'),
    );
    const globs = repoints.map(([, , , glob]) => glob);
    assert.deepEqual(
        [...new Set(globs)].toSorted((left, right) => (left ?? '').localeCompare(right ?? '')),
        LANE_SHAPE_FILES.map((file) => `${TO}${file}`).toSorted((left, right) => left.localeCompare(right)),
    );
    assert.deepEqual(
        repoints.map(([, from]) => from).toSorted((left, right) => (left ?? '').localeCompare(right ?? '')),
        ['#src/recap/domain/ids.ts', '#src/recap/domain/ids.ts', '#src/recap/domain/lane.ts', '#src/recap/domain/lane.ts', '#src/recap/domain/lane.ts', '#src/recap/domain/lane.ts', '#src/recap/domain/lane.ts', '#src/recap/domain/lane.ts'],
    );
});

test('every moved engine file leaves a one-line stub that re-exports it from the package', () => {
    assert.equal(stubs.length, engine.length);
    assert.deepEqual(
        stubs.map(([, from]) => from),
        moves.map(([, from]) => from),
    );
    assert.equal(stubOf('src/recap/domain/brand.ts'), "export * from '@stateforge-labs/session-ledger/unstable/recap/domain/brand.ts';");
    for (const [, from = '', line = ''] of stubs) assert.equal(line, stubOf(from.slice(FROM.length)));
    assert.throws(() => stubOf('bin/main.ts'), /not under src/u);
});

test('no row rewrites a #src importer of an engine path, so the stubs serve them', () => {
    assert.deepEqual(rows.filter(([kind]) => kind === 'specifier'), []);
    for (const [, , , glob] of repoints) assert.ok((glob ?? '').startsWith(TO), glob);
});

test('no row targets a file outside the engine manifest, and every row is a path, a text or a stub row', () => {
    const owned = new Set(engine.map((file) => `${TO}${file}`));
    for (const [, from = ''] of moves) assert.ok(from.startsWith(FROM) && engine.includes(from.slice(FROM.length)), from);
    for (const [, , , glob] of repoints) assert.ok(owned.has(glob ?? ''), glob);
    assert.deepEqual(rows.filter(([kind]) => kind !== 'path' && kind !== 'text' && kind !== 'stub'), []);
});

test('the committed map equals the generator output', () => {
    assert.equal(readFileSync(MOVE_MAP_PATH, 'utf8'), moveMap(engine));
});

const plugin = baselineOf(JSON.parse(readFileSync(PLUGIN_ENGINE_BASELINE_PATH, 'utf8')));

test('the plugin engine baseline has one row per engine file it counts, and every row is a moved file', () => {
    assert.equal(Object.keys(plugin).length, 79);
    for (const file of Object.keys(plugin)) assert.ok(engine.includes(file), file);
});

test('the package rows may fall below the plugin rows, as the dry run measured, but never rise', () => {
    const measured = {
        ...plugin,
        'src/ports/recap-records.ts': { ...plugin['src/ports/recap-records.ts'], property: 22 },
        'src/recap/application/ledger-reconcile.ts': { ...plugin['src/recap/application/ledger-reconcile.ts'], container: 3 },
        'src/recap/domain/lane-shape.ts': { property: 1 },
    };
    assert.equal(plugin['src/ports/recap-records.ts']?.['property'], 27);
    assert.equal(plugin['src/recap/application/ledger-reconcile.ts']?.['container'], 8);
    assert.deepEqual(packageRowsAbovePlugin(plugin, measured, ['src/recap/domain/lane-shape.ts']), []);
    assert.deepEqual(packageRowsAbovePlugin(plugin, plugin, []), []);
    assert.deepEqual(packageRowsAbovePlugin(plugin, {}, []), []);
});

test('a package row above its plugin row, a new category or an unlisted new file is a rise', () => {
    const risen = {
        ...plugin,
        'src/ports/recap-records.ts': { ...plugin['src/ports/recap-records.ts'], property: 28, assertion: 1 },
        'src/recap/domain/lane-shape.ts': { property: 1 },
    };
    assert.deepEqual(packageRowsAbovePlugin(plugin, risen, []), [
        'src/ports/recap-records.ts assertion 0 -> 1',
        'src/ports/recap-records.ts property 27 -> 28',
        'src/recap/domain/lane-shape.ts property 0 -> 1',
    ]);
});

test('a baseline that is not rows of whole counts is refused', () => {
    assert.throws(() => baselineOf([]), /object of rows/u);
    assert.throws(() => baselineOf({ 'src/a.ts': 3 }), /no category counts/u);
    assert.throws(() => baselineOf({ 'src/a.ts': { property: -1 } }), /not a count/u);
    assert.throws(() => baselineOf({ 'src/a.ts': { property: 1.5 } }), /not a count/u);
});

const PACKAGE_BASELINE_DIR = new URL('../../../packages/session-ledger/gates/domain-types-baseline/', import.meta.url);

test('every engine row of the package baseline folder is at or below its row before the move', () => {
    const files = readdirSync(PACKAGE_BASELINE_DIR).filter((name) => name.endsWith('.json')).toSorted();
    assert.equal(files.length, 6);
    const packageRows: BaselineRows = Object.assign({}, ...files.map((name) => baselineOf(JSON.parse(readFileSync(new URL(name, PACKAGE_BASELINE_DIR), 'utf8')))));
    const engineRows = Object.fromEntries(Object.entries(packageRows).filter(([file]) => !file.startsWith('src/contract/') && !file.endsWith('/legacy.ts')));
    assert.deepEqual(packageRowsAbovePlugin(plugin, engineRows, ['src/recap/domain/lane-shape.ts']), []);
});
