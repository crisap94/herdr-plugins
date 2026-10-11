import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

const ROOT = new URL('../', import.meta.url).pathname;
const SCRATCH = mkdtempSync(join(tmpdir(), 'lanes-map-'));

after(() => {
    rmSync(SCRATCH, { recursive: true, force: true });
});

function generate(file: string | null): ReturnType<typeof spawnSync> {
    return spawnSync('node', ['ci/lanes-generate.ts', '--check'], { cwd: ROOT, encoding: 'utf8', env: file === null ? process.env : { ...process.env, LANES_FILE: file } });
}

function tampered(change: (lanes: Record<string, string[]>) => void): string {
    const parsed: { lanes: Record<string, string[]> } = JSON.parse(readFileSync(join(ROOT, 'ci/lanes.json'), 'utf8'));
    change(parsed.lanes);
    const path = join(SCRATCH, `lanes-${String(Math.random())}.json`);
    writeFileSync(path, JSON.stringify(parsed));
    return path;
}

function lane(name: string, changed: readonly string[]): ReturnType<typeof spawnSync> {
    return spawnSync('node', ['ci/check-lane.ts', name], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, CHANGED_FILES: changed.join('\n') } });
}

test('the lane map lists every file of src and test exactly once', () => {
    const result = generate(null);
    assert.equal(result.status, 0, String(result.stderr));
});

test('a file listed twice fails the map check', () => {
    const result = generate(tampered((lanes) => { lanes['B1']?.push(lanes['B1'][0] ?? ''); }));
    assert.equal(result.status, 1);
    assert.match(String(result.stderr), /listed twice/u);
});

test('a file missing from the map fails the map check', () => {
    const result = generate(tampered((lanes) => { lanes['B2']?.splice(0, 1); }));
    assert.equal(result.status, 1);
    assert.match(String(result.stderr), /missing: /u);
});

test('a file that no longer exists fails the map check', () => {
    const result = generate(tampered((lanes) => { lanes['B3']?.push('src/recap/application/zz-gone.ts'); }));
    assert.equal(result.status, 1);
    assert.match(String(result.stderr), /no such file: /u);
});

test('a lane merge request that edits only its own files and its own baseline passes', () => {
    const own = JSON.parse(readFileSync(join(ROOT, 'ci/lanes.json'), 'utf8')).lanes.B2[0];
    const result = lane('B2', [`tab-recap/${String(own)}`, 'tab-recap/ci/domain-types-baseline/B2.json', 'tab-recap/ci/domain-types-exceptions/B2.json', 'tab-recap/src/recap/domain/legacy.ts', 'README.md']);
    assert.equal(result.status, 0, String(result.stderr));
});

test('a lane merge request that edits a file of another lane fails and names the owner', () => {
    const result = lane('B2', ['tab-recap/src/recap/application/compaction.ts']);
    assert.equal(result.status, 1);
    assert.match(String(result.stderr), /owned by B3/u);
});

test('a lane merge request cannot edit another lane baseline or legacy file', () => {
    const baseline = lane('B2', ['tab-recap/ci/domain-types-baseline/B3.json']);
    assert.equal(baseline.status, 1);
    const legacy = lane('B2', ['tab-recap/src/recap/application/legacy.ts']);
    assert.equal(legacy.status, 1);
});

test('an unknown lane is not covered', () => {
    const result = lane('B9', []);
    assert.equal(result.status, 3);
});
