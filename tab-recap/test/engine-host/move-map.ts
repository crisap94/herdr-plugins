import { readFileSync, writeFileSync } from 'node:fs';

const FROM = 'tab-recap/';
const TO = 'packages/session-ledger/';
const LANE_SHAPE = '#src/recap/domain/lane-shape.ts';

const REPOINTED: readonly (readonly [string, string])[] = [
    ['src/recap/application/engine.ts', '#src/recap/domain/ids.ts'],
    ['src/recap/application/engine.ts', '#src/recap/domain/lane.ts'],
    ['src/recap/application/boundaries.ts', '#src/recap/domain/lane.ts'],
    ['src/recap/application/lane-hints.ts', '#src/recap/domain/lane.ts'],
    ['src/recap/application/recap-input.ts', '#src/recap/domain/lane.ts'],
    ['src/recap/application/recap-job.ts', '#src/recap/domain/ids.ts'],
    ['src/recap/application/recap-job.ts', '#src/recap/domain/lane.ts'],
    ['src/ports/transcripts.ts', '#src/recap/domain/lane.ts'],
];

export function engineOf(manifest: unknown): readonly string[] {
    const engine = typeof manifest === 'object' && manifest !== null && 'engine' in manifest ? manifest.engine : undefined;
    if (!Array.isArray(engine) || !engine.every((file): file is string => typeof file === 'string')) {
        throw new Error('ci/engine-files.json has no "engine" list of paths');
    }
    return engine;
}

export function moveMap(engine: readonly string[]): string {
    const moves = engine.map((file) => `path\t${FROM}${file}\t${TO}${file}`);
    const repoints = REPOINTED.map(([file, from]) => `text\t${from}\t${LANE_SHAPE}\t${TO}${file}`);
    return [...moves, ...repoints].map((line) => `${line}\n`).join('');
}

export const MOVE_MAP_PATH = new URL('../../../ci/codemod/moves/ENG-E2b.tsv', import.meta.url);
export const ENGINE_FILES_PATH = new URL('../../ci/engine-files.json', import.meta.url);

if (import.meta.main) {
    writeFileSync(MOVE_MAP_PATH, moveMap(engineOf(JSON.parse(readFileSync(ENGINE_FILES_PATH, 'utf8')))));
}
