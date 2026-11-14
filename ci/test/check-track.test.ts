import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

const ROOT = new URL('../../', import.meta.url).pathname;
const SCRIPT = join(ROOT, 'ci/check-track.ts');
const TRACKS = join(ROOT, 'ci/tracks.json');
const LANES = join(ROOT, 'tab-recap/ci/lanes.json');
const SCRATCH = mkdtempSync(join(tmpdir(), 'check-track-'));

after(() => {
    rmSync(SCRATCH, { recursive: true, force: true });
});

type Run = { readonly status: number | null; readonly stdout: string; readonly stderr: string };

function check(branch: string | null, changed: readonly string[], extra: Readonly<Record<string, string>> = {}): Run {
    const env: Record<string, string | undefined> = { ...process.env, CHANGED_FILES: changed.join('\n'), TRACKS_FILE: TRACKS, LANES_FILE: LANES, ...extra };
    delete env['CI_MERGE_REQUEST_SOURCE_BRANCH_NAME'];
    delete env['CI_MERGE_REQUEST_LABELS'];
    if (extra['CI_MERGE_REQUEST_LABELS'] !== undefined) env['CI_MERGE_REQUEST_LABELS'] = extra['CI_MERGE_REQUEST_LABELS'];
    const result = spawnSync(process.execPath, [SCRIPT, ...(branch === null ? [] : [branch])], { cwd: ROOT, encoding: 'utf8', env });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function laneFiles(key: string): readonly string[] {
    const parsed: { lanes: Record<string, string[]> } = JSON.parse(readFileSync(LANES, 'utf8'));
    return parsed.lanes[key] ?? [];
}

function git(cwd: string, args: readonly string[]): string {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function manifestChange(branch: string, before: Readonly<Record<string, unknown>>, afterChange: Readonly<Record<string, unknown>>): Run {
    const repo = mkdtempSync(join(SCRATCH, 'repo-'));
    git(repo, ['init', '-q', '-b', 'main']);
    git(repo, ['config', 'user.email', 'check-track@example.invalid']);
    git(repo, ['config', 'user.name', 'check-track']);
    git(repo, ['config', 'commit.gpgsign', 'false']);
    writeFileSync(join(repo, 'package.json'), `${JSON.stringify(before, null, 2)}\n`);
    git(repo, ['add', '.']);
    git(repo, ['commit', '-q', '-m', 'base']);
    git(repo, ['checkout', '-q', '-b', 'work']);
    writeFileSync(join(repo, 'package.json'), `${JSON.stringify(afterChange, null, 2)}\n`);
    git(repo, ['commit', '-q', '-am', 'change']);
    const env: Record<string, string | undefined> = { ...process.env, TRACKS_FILE: TRACKS, LANES_FILE: LANES, TRACK_BASE: 'main' };
    delete env['CHANGED_FILES'];
    delete env['CI_MERGE_REQUEST_LABELS'];
    const result = spawnSync(process.execPath, [SCRIPT, branch], { cwd: repo, encoding: 'utf8', env });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

const BASE_MANIFEST = { name: 'x', version: '1.0.0', scripts: { test: 'bun test' }, dependencies: { a: '1.0.0' } };

test('rule 1: the branch name picks the track; a lane branch leaves files to lane-scope; a release branch edits only the release files; any other branch is held only to locked paths and package.json fields', () => {
    assert.equal(check('track/HOOK-h1a-receiver', ['tab-recap/src/adapters/hooks/receiver.ts']).status, 0);
    const lane = check('lane/B3-1-application', ['tab-recap/src/recap/application/engine.ts']);
    assert.equal(lane.status, 0, lane.stderr);
    assert.equal(check('release/tab-recap-v3.0.3', ['CHANGELOG.md', 'tab-recap/herdr-plugin.toml']).status, 0);
    const release = check('release/tab-recap-v3.0.3', ['README.md']);
    assert.equal(release.status, 1);
    assert.match(release.stderr, /release branch edits only the release files/u);
    assert.equal(check('feature/anything', ['tab-recap/src/daemon/main.ts']).status, 0);
    assert.equal(check('feature/anything', ['bun.lock']).status, 1);
});

test('rule 2: a changed path belongs to the first track whose globs match it, then to its B lane, then to FND', () => {
    const engine = check('track/HOOK-x', ['tab-recap/src/recap/application/engine.ts']);
    assert.equal(engine.status, 1);
    assert.match(engine.stderr, /owned by ENG/u);
    const store = check('track/HOOK-x', ['tab-recap/src/adapters/db/open.ts']);
    assert.match(store.stderr, /owned by STO/u);
    const view = check('track/HOOK-x', ['tab-recap/src/recap/render/present.ts']);
    assert.match(view.stderr, /owned by VIEW/u);
    const daemon = check('track/HOOK-x', ['tab-recap/src/daemon/main.ts']);
    assert.match(daemon.stderr, /owned by B7/u);
    const wire = check('track/HOOK-x', ['tab-recap/src/wire/view/codec.ts']);
    assert.match(wire.stderr, /owned by FND/u);
    assert.equal(check('track/FND-W1-wire', ['tab-recap/src/wire/view/codec.ts']).status, 0);
    assert.equal(check('track/ENG-E2b-move', ['tab-recap/src/recap/application/engine.ts', 'packages/session-ledger/src/index.ts']).status, 0);
    assert.equal(check('track/ENG-x', ['packages/session-ledger/gates/graph.sh']).status, 1);
    assert.equal(check('track/FND-1c-gates', ['packages/session-ledger/gates/graph.sh']).status, 0);
});

test('rule 3: shared paths admit the tracks they name, and tests are open except a B lane test, which only PHB may edit without the label', () => {
    assert.equal(check('track/HOOK-x', ['tab-recap/CONTEXT.md']).status, 0);
    assert.equal(check('track/STO-x', ['tab-recap/CONTEXT.md']).status, 1);
    assert.equal(check('track/HOOK-x', ['tab-recap/test/zz-new.test.ts']).status, 0);
    const bTest = laneFiles('B3').find((file) => file.startsWith('test/'));
    assert.notEqual(bTest, undefined);
    const foreign = check('track/HOOK-x', [`tab-recap/${String(bTest)}`]);
    assert.equal(foreign.status, 1);
    assert.match(foreign.stderr, /owned by B3/u);
    assert.equal(check('track/PHB-b37-counts', [`tab-recap/${String(bTest)}`]).status, 0);
    const engTest = laneFiles('ENG').find((file) => file.startsWith('test/'));
    assert.notEqual(engTest, undefined);
    assert.equal(check('track/HOOK-x', [`tab-recap/${String(engTest)}`]).status, 0);
});

test('rule 4: locked paths open only to their named branches, and the crossing label does not lift them', () => {
    assert.equal(check('track/FND-8c-baselines', ['bun.lock']).status, 1);
    assert.equal(check('track/FND-deps-9c-adapters', ['bun.lock']).status, 0);
    assert.equal(check('track/HOOK-x', ['.gitlab-ci.yml'], { CI_MERGE_REQUEST_LABELS: 'track-scope::crosses' }).status, 1);
    assert.equal(check('track/CI-c2-release', ['.gitlab-ci.yml']).status, 0);
    assert.equal(check('track/FND-7b-pipeline', ['.gitlab-ci.yml', 'ci/tracks.json']).status, 0);
    assert.equal(check('track/ENG-x', ['ci/tracks.json']).status, 1);
    assert.equal(check('track/FND-x', ['tab-recap/test/fixtures/engine-golden-one.txt']).status, 1);
    assert.equal(check('track/ENG-x', ['tab-recap/test/fixtures/engine-golden-one.txt']).status, 0);
});

test('rule 5: dependency fields only on the deps lane, version only on a release branch, scripts and exports only on FND and CI', () => {
    const dependencies = { ...BASE_MANIFEST, dependencies: { a: '2.0.0' } };
    const refused = manifestChange('track/HOOK-x', BASE_MANIFEST, dependencies);
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /changes dependencies of a package\.json/u);
    assert.equal(manifestChange('track/FND-deps-9d-hooks', BASE_MANIFEST, dependencies).status, 0);
    const version = { ...BASE_MANIFEST, version: '1.0.1' };
    assert.equal(manifestChange('release/x-v1.0.1', BASE_MANIFEST, version).status, 1, 'the root package.json is not a release file');
    assert.equal(manifestChange('track/FND-x', BASE_MANIFEST, version).status, 1);
    const scripts = { ...BASE_MANIFEST, scripts: { test: 'bun test --bail' } };
    assert.equal(manifestChange('track/CI-x', BASE_MANIFEST, scripts).status, 0);
    assert.equal(manifestChange('track/ENG-x', BASE_MANIFEST, scripts).status, 1);
});

test('rule 6: with the crossing label a foreign path passes and is printed', () => {
    const changed = ['tab-recap/src/adapters/db/database.ts'];
    assert.equal(check('track/STO-M2b-1-role', changed).status, 1);
    const crossed = check('track/STO-M2b-1-role', changed, { CI_MERGE_REQUEST_LABELS: 'changelog::internal,track-scope::crosses' });
    assert.equal(crossed.status, 0, crossed.stderr);
    assert.match(crossed.stdout, /crossing tab-recap\/src\/adapters\/db\/database\.ts \(owned by B5\)/u);
});

test('rule 7: exit 0 when clean, 1 for a file outside the track, 3 when not covered', () => {
    assert.equal(check('track/PANE-x', ['tab-recap/src/pane/relay.ts']).status, 0);
    assert.equal(check('track/PANE-x', ['tab-recap/src/adapters/hooks/receiver.ts']).status, 1);
    assert.equal(check(null, []).status, 3);
    assert.equal(check('track/PANE-x', [], { TRACKS_FILE: join(SCRATCH, 'no-such-tracks.json') }).status, 3);
    const broken = join(SCRATCH, 'broken-tracks.json');
    writeFileSync(broken, '{"locked": []}');
    assert.equal(check('track/PANE-x', [], { TRACKS_FILE: broken }).status, 3);
});

test('a track/PHB- branch is held to the PHB globs: the openspec change passes, a lane file needs the label', () => {
    assert.equal(check('track/PHB-b37-counts', ['openspec/changes/domain-type-gates/tasks.md', 'openspec/changes/domain-type-gates/design.md']).status, 0);
    const legacy = check('track/PHB-bca-legacy', ['tab-recap/src/recap/domain/ids.ts']);
    assert.equal(legacy.status, 1);
    assert.match(legacy.stderr, /owned by B2/u);
    assert.equal(check('track/PHB-bca-legacy', ['tab-recap/src/recap/domain/ids.ts'], { CI_MERGE_REQUEST_LABELS: 'track-scope::crosses' }).status, 0);
});

test('a shared slot file admits its own track and SW, and no other track', () => {
    const slot = ['tab-recap/src/daemon/slots/hooks.ts'];
    assert.equal(check('track/HOOK-h1b-endpoint', slot).status, 0);
    assert.equal(check('track/SW-h3-hooks-on', slot).status, 0);
    const pane = check('track/PANE-x', slot);
    assert.equal(pane.status, 1);
    assert.match(pane.stderr, /owned by HOOK/u);
    assert.equal(check('track/ENG-x', ['tab-recap/src/daemon/slots/timing.ts']).status, 0);
    assert.equal(check('track/SW-x', ['tab-recap/src/daemon/slots/timing.ts']).status, 0);
});

test('probe owners: the wire-self-contained probes belong to FND (row FND-W1), not to CI', () => {
    const probe = 'tab-recap/ci/probes/depcruise/wire-self-contained/bad/src/wire/view/protocol.ts';
    assert.equal(check('track/FND-W1-view-wire-contract', [probe]).status, 0);
    const refused = check('track/CI-x', [probe]);
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /owned by FND/u);
});

test('probe owners: the workspace-types-only probes belong to FND (row FND-6b-1), not to CI', () => {
    const probe = 'tab-recap/ci/probes/depcruise/workspace-types-only/good/src/index.ts';
    assert.equal(check('track/FND-6b-1-seams', [probe]).status, 0);
    const refused = check('track/CI-x', [probe]);
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /owned by FND/u);
});

test('probe owners: a domain-types probe whose folder name contains exception-wire belongs to FND, not to CI', () => {
    const probes = [
        'tab-recap/ci/probes/domain-types/good-exception-wire/src/wire/frame.ts',
        'tab-recap/ci/probes/domain-types/bad-exception-wire-outside/expect',
        'tab-recap/ci/probes/domain-types/bad-exception-wire-parameter/ci/domain-types-exceptions/lead.json',
    ];
    assert.equal(check('track/FND-W1-view-wire-contract', probes).status, 0);
    const refused = check('track/CI-x', [probes[0] ?? '']);
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /owned by FND/u);
});

test('probe owners: the pane-closure probes belong to PANE (row M3) and the hooks-only-in-adapter probes to HOOK (row H1b)', () => {
    const pane = 'tab-recap/ci/probes/depcruise/pane-closure/bad/src/pane/relay.ts';
    assert.equal(check('track/PANE-M3-relay', [pane]).status, 0);
    const paneRefused = check('track/FND-x', [pane]);
    assert.equal(paneRefused.status, 1);
    assert.match(paneRefused.stderr, /owned by PANE/u);
    const hooks = 'tab-recap/ci/probes/depcruise/hooks-only-in-adapter/bad/src/main.ts';
    assert.equal(check('track/HOOK-H1b-endpoint', [hooks]).status, 0);
    const hooksRefused = check('track/CI-x', [hooks]);
    assert.equal(hooksRefused.status, 1);
    assert.match(hooksRefused.stderr, /owned by HOOK/u);
});

test('probe owners: every other probe folder stays with CI', () => {
    const others = [
        'tab-recap/ci/probes/domain-types/good-exception-callback/tsconfig.json',
        'tab-recap/ci/probes/depcruise/no-circular/bad/src/a.ts',
        'tab-recap/ci/probes/domain-types/tsconfig.base.json',
    ];
    assert.equal(check('track/CI-x', others).status, 0);
    const refused = check('track/FND-x', [others[0] ?? '']);
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /owned by CI/u);
});
