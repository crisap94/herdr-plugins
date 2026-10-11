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

function generate(file: string | null, skip: string | null = null): ReturnType<typeof spawnSync> {
    const env = { ...process.env, ...(file === null ? {} : { LANES_FILE: file }), ...(skip === null ? {} : { LANES_SKIP_LIST: skip }) };
    return spawnSync('node', ['ci/lanes-generate.ts', '--check'], { cwd: ROOT, encoding: 'utf8', env });
}

function written(name: string, text: string): string {
    const path = join(SCRATCH, name);
    writeFileSync(path, text);
    return path;
}

function mapWithout(prefix: string): string {
    const parsed: { lanes: Record<string, string[]> } = JSON.parse(readFileSync(join(ROOT, 'ci/lanes.json'), 'utf8'));
    for (const lane of Object.keys(parsed.lanes)) parsed.lanes[lane] = (parsed.lanes[lane] ?? []).filter((file) => !file.startsWith(prefix));
    return written(`without-${String(Math.random())}.json`, `${JSON.stringify(parsed, null, 2)}\n`);
}

function tampered(change: (lanes: Record<string, string[]>) => void): string {
    const parsed: { lanes: Record<string, string[]> } = JSON.parse(readFileSync(join(ROOT, 'ci/lanes.json'), 'utf8'));
    change(parsed.lanes);
    const path = join(SCRATCH, `lanes-${String(Math.random())}.json`);
    writeFileSync(path, JSON.stringify(parsed));
    return path;
}

function lane(name: string, changed: readonly string[], extra: Record<string, string> = {}): ReturnType<typeof spawnSync> {
    return spawnSync('node', ['ci/check-lane.ts', name], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, CHANGED_FILES: changed.join('\n'), ...extra } });
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

test('a lane that adds a file lists it under its own key of the lane map and passes', () => {
    const head = tampered((lanes) => { lanes['B2']?.push('src/recap/domain/zz-new.ts'); });
    const result = lane('B2', ['tab-recap/src/recap/domain/zz-new.ts', 'tab-recap/ci/lanes.json'], { LANES_FILE: head, LANES_BASE_FILE: join(ROOT, 'ci/lanes.json') });
    assert.equal(result.status, 0, String(result.stderr));
});

test('a lane that changes the key of another lane in the lane map fails and names it', () => {
    const head = tampered((lanes) => { lanes['B3']?.push('src/recap/application/zz-new.ts'); });
    const result = lane('B2', ['tab-recap/ci/lanes.json'], { LANES_FILE: head, LANES_BASE_FILE: join(ROOT, 'ci/lanes.json') });
    assert.equal(result.status, 1);
    assert.match(String(result.stderr), /changes the lanes B3/u);
});

test('a lane cannot edit the pipeline file', () => {
    const result = lane('B2', ['.gitlab-ci.yml']);
    assert.equal(result.status, 1);
});

test('a lane merge request may edit the tests and fakes of another lane, and still not its source', () => {
    const other = JSON.parse(readFileSync(join(ROOT, 'ci/lanes.json'), 'utf8')).lanes.B3.find((file: string) => file.startsWith('test/'));
    assert.equal(lane('B2', [`tab-recap/${String(other)}`, 'tab-recap/test/fakes/ask-ledger.ts']).status, 0);
    assert.equal(lane('B2', ['tab-recap/src/recap/application/compaction.ts']).status, 1);
});

test('a foreign source edit fails without the adapts label and passes with it, but never a foreign baseline, legacy file or the pipeline', () => {
    const foreign = ['tab-recap/src/recap/application/compaction.ts'];
    assert.equal(lane('B2', foreign).status, 1);
    const adapting = lane('B2', foreign, { LANE_ADAPTS: '1' });
    assert.equal(adapting.status, 0, String(adapting.stderr));
    assert.match(String(adapting.stdout), /adapting tab-recap\/src\/recap\/application\/compaction\.ts \(owned by B3\)/u);
    assert.equal(lane('B2', ['tab-recap/ci/domain-types-baseline/B3.json'], { LANE_ADAPTS: '1' }).status, 1);
    assert.equal(lane('B2', ['tab-recap/src/recap/application/legacy.ts'], { LANE_ADAPTS: '1' }).status, 1);
    assert.equal(lane('B2', ['.gitlab-ci.yml'], { LANE_ADAPTS: '1' }).status, 1);
    assert.equal(lane('B2', ['tab-recap/src/recap/application/zz-unowned.ts'], { LANE_ADAPTS: '1' }).status, 1);
});

test('a path named in the skip list is not expected in the map; a folder entry skips what is under it', () => {
    const skip = written('skip.txt', '# listed\ntab-recap/src/protocol/result.ts\ntab-recap/test/fixtures/\nexperiments/\n');
    const without = mapWithout('src/protocol/result.ts');
    assert.equal(generate(without, skip).status, 1, 'the folder entry leaves its files out of the map');
    const both = mapWithout('test/fixtures/');
    assert.equal(generate(both, skip).status, 1, 'the listed source file is still in this map');
    const parsed: { lanes: Record<string, string[]> } = JSON.parse(readFileSync(both, 'utf8'));
    for (const lane of Object.keys(parsed.lanes)) parsed.lanes[lane] = (parsed.lanes[lane] ?? []).filter((file) => file !== 'src/protocol/result.ts');
    const all = written(`all-${String(Math.random())}.json`, `${JSON.stringify(parsed, null, 2)}\n`);
    assert.equal(generate(all, skip).status, 0);
    assert.equal(generate(all).status, 1, 'without the list the same map misses those files');
});

test('a skip list that is absent changes nothing', () => {
    assert.equal(generate(null, join(SCRATCH, 'no-such-list.txt')).status, 0);
});
