import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { ENGINE_FILES_PATH, MOVE_MAP_PATH, engineOf, moveMap, stubOf } from './move-map.ts';

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
