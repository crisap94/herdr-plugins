import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

declare const Bun: Readonly<{ YAML: Readonly<{ parse(text: string): unknown }> }>;

const repository = join(dirname(new URL(import.meta.url).pathname), '..', '..');
const MACOS_ONLY = "${{ matrix.os == 'macos-latest' }}";
const GUARD = 'if [ -f "$UNIT/gates/run.sh" ]; then';

type Step = Readonly<{ run?: string; 'working-directory'?: string; env?: Readonly<Record<string, string>> }>;
type Job = Readonly<{
    'continue-on-error'?: unknown;
    defaults?: Readonly<{ run?: Readonly<{ 'working-directory'?: string }> }>;
    strategy?: Readonly<{ matrix?: Readonly<{ os?: readonly string[]; unit?: readonly string[] }> }>;
    steps?: readonly Step[];
}>;
type Workflow = Readonly<{ jobs?: Readonly<Record<string, Job>> }>;

function workflow(name: string): Workflow {
    const text = readFileSync(join(repository, '.github', 'workflows', name), 'utf8');
    const parsed: unknown = Bun.YAML.parse(text);
    assert.equal(typeof parsed, 'object', `${name} does not parse to a mapping`);
    return parsed as Workflow;
}

function jobsOf(name: string): Readonly<Record<string, Job>> {
    const { jobs } = workflow(name);
    assert.ok(jobs !== undefined, `${name} has no jobs`);
    return jobs;
}

function job(name: string): Job {
    const found = jobsOf('ci.yml')[name];
    assert.ok(found !== undefined, `ci.yml has no job ${name}`);
    return found;
}

function unitsOnDisk(): readonly string[] {
    return ['.', 'packages']
        .filter((parent) => existsSync(join(repository, parent)))
        .flatMap((parent) => readdirSync(join(repository, parent)).map((name) => (parent === '.' ? name : `${parent}/${name}`)))
        .filter((unit) => existsSync(join(repository, unit, 'gates', 'run.sh')))
        .toSorted();
}

function matrixUnits(): readonly string[] {
    return job('check').strategy?.matrix?.unit ?? [];
}

test('both workflow files parse as YAML and have jobs', () => {
    assert.ok(Object.keys(jobsOf('ci.yml')).length > 0);
    assert.ok(Object.keys(jobsOf('release.yml')).length > 0);
});

test('the check job keeps the two operating systems', () => {
    assert.deepEqual(job('check').strategy?.matrix?.os, ['ubuntu-latest', 'macos-latest']);
});

test('every folder that holds gates/run.sh is a unit of the matrix', () => {
    const units = new Set(matrixUnits());
    assert.deepEqual(unitsOnDisk().filter((unit) => !units.has(unit)), []);
});

test('every unit of the matrix is a folder of the repository or is guarded by the gates/run.sh test', () => {
    const guarded = (job('check').steps ?? []).some((step) => step.run?.includes(GUARD) === true && step.env?.['UNIT'] === '${{ matrix.unit }}');
    const absent = matrixUnits().filter((unit) => !existsSync(join(repository, unit)));
    assert.ok(guarded || absent.length === 0, `units without a folder and no guard: ${absent.join(', ')}`);
    assert.ok(guarded, 'the gates step does not test for $UNIT/gates/run.sh before it runs it');
});

test('no job or step of ci.yml runs inside tab-recap: every command starts at the repository root', () => {
    const jobs = Object.entries(jobsOf('ci.yml'));
    const byDefault = jobs.filter(([, entry]) => entry.defaults?.run?.['working-directory'] !== undefined).map(([name]) => name);
    const byStep = jobs.filter(([, entry]) => (entry.steps ?? []).some((step) => step['working-directory'] !== undefined)).map(([name]) => name);
    assert.deepEqual(byDefault, []);
    assert.deepEqual(byStep, []);
});

test('continue-on-error is set for the macOS leg only', () => {
    const marked = Object.entries(jobsOf('ci.yml')).filter(([, entry]) => entry['continue-on-error'] !== undefined);
    assert.deepEqual(marked.map(([name, entry]) => [name, entry['continue-on-error']]), [['check', MACOS_ONLY]]);
});

test('the floor job runs the tab-recap unit only', () => {
    const runs = (job('floor').steps ?? []).flatMap((step) => (step.run === undefined ? [] : [step.run]));
    const gates = runs.filter((run) => run.includes('gates/run.sh'));
    assert.deepEqual(gates, ['bash tab-recap/gates/run.sh lint', 'bash tab-recap/gates/run.sh test']);
});

type Rule = Readonly<{ if?: string; changes?: readonly string[]; exists?: readonly string[] }>;
type PipelineJob = Readonly<{ stage?: string; extends?: string; needs?: readonly (string | Readonly<{ job: string }>)[]; rules?: readonly Rule[] }>;
type Env = Readonly<Record<string, string>>;
type Scripted = Readonly<{ script?: readonly string[] }>;

const UNIT_JOBS: readonly string[] = [
    'unit:root',
    'unit:tab-recap:lint',
    'unit:tab-recap:test',
    'unit:tab-recap:floor',
    'unit:session-ledger',
    'unit:session-ledger-sqlite',
    'unit:recap-view',
    'unit:desktop',
    'unit:agent-sdk',
];
const PACKAGE_JOBS: readonly string[] = ['unit:session-ledger', 'unit:session-ledger-sqlite', 'unit:recap-view'];
const PLUGIN_JOBS: readonly string[] = ['unit:tab-recap:lint', 'unit:tab-recap:test', 'unit:tab-recap:floor'];
const RELEASE_JOBS: readonly string[] = ['release:prepare', 'release:tag', 'release-notes', 'release'];
const MERGE_REQUEST: Env = {
    CI_PIPELINE_SOURCE: 'merge_request_event',
    CI_MERGE_REQUEST_SOURCE_BRANCH_NAME: 'track/CI-1-example',
    CI_MERGE_REQUEST_TARGET_BRANCH_NAME: 'main',
    CI_DEFAULT_BRANCH: 'main',
};

function pipeline(): Readonly<{ stages: readonly string[]; jobs: ReadonlyMap<string, PipelineJob> }> {
    const text = readFileSync(join(repository, '.gitlab-ci.yml'), 'utf8');
    const parsed = Bun.YAML.parse(text) as Readonly<Record<string, unknown>>;
    assert.equal(typeof parsed, 'object', '.gitlab-ci.yml does not parse to a mapping');
    const jobs = new Map<string, PipelineJob>();
    for (const [name, body] of Object.entries(parsed)) {
        if (name.startsWith('.') || typeof body !== 'object' || body === null || Array.isArray(body) || !('script' in body || 'stage' in body)) continue;
        jobs.set(name, body as PipelineJob);
    }
    return { stages: (parsed['stages'] ?? []) as readonly string[], jobs };
}

function globToRegExp(glob: string): RegExp {
    let source = '';
    for (let index = 0; index < glob.length; index += 1) {
        const rest = glob.slice(index);
        if (rest.startsWith('**/')) {
            source += '(?:.*/)?';
            index += 2;
        } else if (rest.startsWith('**')) {
            source += '.*';
            index += 1;
        } else if (rest.startsWith('*')) source += '[^/]*';
        else source += (glob[index] ?? '').replace(/[.+?^${}()|[\]\\]/gu, '\\$&');
    }
    return new RegExp(`^${source}$`, 'u');
}

function atomHolds(atom: string, env: Env): boolean {
    const text = atom.trim();
    const compared = /^\$(\w+) (==|!=) (?:"([^"]*)"|\$(\w+))$/u.exec(text);
    if (compared !== null) {
        const right = compared[4] === undefined ? compared[3] : env[compared[4]];
        return (env[compared[1] ?? ''] === right) === (compared[2] === '==');
    }
    const matched = /^\$(\w+) =~ \/((?:\\.|[^/\\])*)\/$/u.exec(text);
    if (matched !== null) return new RegExp((matched[2] ?? '').replaceAll('\\/', '/'), 'u').test(env[matched[1] ?? ''] ?? '');
    const bare = /^\$(\w+)$/u.exec(text);
    assert.ok(bare !== null, `the rule evaluator does not understand: ${text}`);
    return (env[bare[1] ?? ''] ?? '') !== '';
}

function conditionHolds(expression: string, env: Env): boolean {
    return expression.split(' || ').some((alternative) => alternative.split(' && ').every((atom) => atomHolds(atom, env)));
}

type Present = (path: string) => boolean;

const onDisk: Present = (path) => {
    if (!path.includes('*')) return existsSync(join(repository, path));
    const folder = dirname(path);
    if (!existsSync(join(repository, folder))) return false;
    const pattern = globToRegExp(path);
    return readdirSync(join(repository, folder)).some((name) => pattern.test(`${folder}/${name}`));
};

function ruleMatches(rule: Rule, env: Env, files: readonly string[], present: Present): boolean {
    if (rule.if !== undefined && !conditionHolds(rule.if, env)) return false;
    if (rule.changes !== undefined && !rule.changes.some((glob) => files.some((file) => globToRegExp(glob).test(file)))) return false;
    if (rule.exists !== undefined && !rule.exists.every((path) => present(path))) return false;
    return true;
}

function jobsThatRun(env: Env, files: readonly string[], present: Present = onDisk): readonly string[] {
    return [...pipeline().jobs]
        .filter(([, entry]) => entry.rules === undefined || entry.rules.some((rule) => ruleMatches(rule, env, files, present)))
        .map(([name]) => name)
        .toSorted();
}

const MERGE_REQUEST_JOBS: readonly string[] = ['merge-request-notes', 'track-scope'];
const CHECKED_JOBS: ReadonlySet<string> = new Set([...UNIT_JOBS, 'install-smoke', 'track-scope', 'lane-scope', 'domain-baseline', 'merge-request-notes']);

function checked(env: Env, files: readonly string[], present: Present = onDisk): readonly string[] {
    return jobsThatRun(env, files, present).filter((name) => CHECKED_JOBS.has(name));
}

function sorted(...groups: readonly (readonly string[])[]): readonly string[] {
    return groups.flat().toSorted();
}

test('the pipeline file parses and every stage used is declared', () => {
    const { stages, jobs } = pipeline();
    assert.ok(jobs.size > 0);
    const undeclared = [...jobs].filter(([, entry]) => entry.stage !== undefined && !stages.includes(entry.stage)).map(([name]) => name);
    assert.deepEqual(undeclared, []);
});

test('every job named in a needs: exists', () => {
    const { jobs } = pipeline();
    const missing = [...jobs].flatMap(([name, entry]) =>
        (entry.needs ?? []).map((need) => (typeof need === 'string' ? need : need.job)).filter((need) => !jobs.has(need)).map((need) => `${name} -> ${need}`),
    );
    assert.deepEqual(missing, []);
});

test('every unit job has the two rules: all non-merge-request pipelines, then merge requests on its paths', () => {
    const { jobs } = pipeline();
    for (const name of UNIT_JOBS) {
        const rules = jobs.get(name)?.rules;
        assert.ok(rules !== undefined, `${name} is missing`);
        assert.equal(rules.length, 2, `${name} does not have exactly two rules`);
        const [always, onPaths] = rules;
        assert.ok(always !== undefined && onPaths !== undefined, `${name}: a rule is missing`);
        assert.equal(always.if, '$CI_PIPELINE_SOURCE != "merge_request_event"', `${name}: first rule`);
        assert.equal(always.changes, undefined);
        assert.equal(onPaths.if, '$CI_PIPELINE_SOURCE == "merge_request_event"', `${name}: second rule`);
        assert.ok((onPaths.changes ?? []).includes('bun.lock'), `${name}: the shared paths are missing`);
    }
});

test('the release jobs need every unit job they used to need, and the install smoke', () => {
    const { jobs } = pipeline();
    const wanted = sorted(PLUGIN_JOBS, PACKAGE_JOBS, ['install-smoke']);
    for (const name of ['release:prepare', 'release:tag', 'release-notes']) {
        assert.deepEqual((jobs.get(name)?.needs ?? []).map((need) => (typeof need === 'string' ? need : need.job)).toSorted(), wanted, name);
    }
});

test('the old plugin jobs and the package bridge are gone', () => {
    const { jobs } = pipeline();
    for (const name of ['lint', 'test', 'test:floor']) assert.equal(jobs.has(name), false, name);
    assert.equal(existsSync(join(repository, 'tab-recap', 'ci', 'gates.d', '00-packages.sh')), false);
    assert.equal(readFileSync(join(repository, 'tab-recap', 'ci', 'test.sh'), 'utf8').includes('packages/*/gates/run.sh'), false);
});

test('path rules 1: a package README runs that package, the plugin and track-scope', () => {
    assert.deepEqual(
        checked(MERGE_REQUEST, ['packages/recap-view/README.md']),
        sorted(['unit:recap-view'], PLUGIN_JOBS, MERGE_REQUEST_JOBS),
    );
});

test('path rules 2: the ledger runs the packages and the plugin but not the root or the smoke', () => {
    assert.deepEqual(
        checked(MERGE_REQUEST, ['packages/session-ledger/src/index.ts']),
        sorted(PACKAGE_JOBS, ['unit:agent-sdk'], PLUGIN_JOBS, MERGE_REQUEST_JOBS),
    );
});

test('path rules 3: a plugin source file runs the plugin only, and lane-scope on a lane branch', () => {
    const files = ['tab-recap/src/daemon/main.ts'];
    assert.deepEqual(checked(MERGE_REQUEST, files), sorted(PLUGIN_JOBS, MERGE_REQUEST_JOBS));
    assert.deepEqual(
        checked({ ...MERGE_REQUEST, CI_MERGE_REQUEST_SOURCE_BRANCH_NAME: 'lane/B3-example' }, files),
        sorted(PLUGIN_JOBS, MERGE_REQUEST_JOBS, ['lane-scope']),
    );
});

test('the lane-scope and domain-baseline rules carry their exists: guards', () => {
    const jobs = pipeline().jobs;
    assert.deepEqual(jobs.get('lane-scope')?.rules, [
        {
            if: '$CI_PIPELINE_SOURCE == "merge_request_event" && $CI_MERGE_REQUEST_SOURCE_BRANCH_NAME =~ /^lane\\/B[1-8]-/',
            exists: ['tab-recap/ci/lanes.json'],
        },
    ]);
    assert.deepEqual(jobs.get('domain-baseline')?.rules, [
        { if: '$CI_PIPELINE_SOURCE == "merge_request_event"', exists: ['tab-recap/ci/domain-types-baseline/*.json'] },
    ]);
});

const laneMapAndBaselineGone: Present = (path) => !path.startsWith('tab-recap/ci/domain-types-baseline/') && path !== 'tab-recap/ci/lanes.json';

test('path rules 11: with the baseline folder and lane map gone, domain-baseline and lane-scope switch themselves off', () => {
    assert.deepEqual(
        checked({ ...MERGE_REQUEST, CI_MERGE_REQUEST_SOURCE_BRANCH_NAME: 'lane/B3-example' }, ['tab-recap/src/daemon/main.ts'], laneMapAndBaselineGone),
        sorted(PLUGIN_JOBS, ['merge-request-notes', 'track-scope']),
    );
});

test('the glob guard no longer matches the baseline folder, which is gone, and still matches a folder that exists', () => {
    assert.equal(onDisk('tab-recap/ci/domain-types-baseline/*.json'), false);
    assert.equal(onDisk('tab-recap/ci/domain-types-exceptions/*.json'), true);
    assert.equal(onDisk('tab-recap/ci/no-such-folder/*.json'), false);
});

test('path rules 4: a root ci file runs the root unit, the plugin lint that exercises the ci scripts, and track-scope', () => {
    assert.deepEqual(checked(MERGE_REQUEST, ['ci/check-track.ts']), sorted(['unit:root', 'unit:tab-recap:lint'], MERGE_REQUEST_JOBS));
});

test('path rules 4b: the eval harness runs the plugin lint, which type-checks it', () => {
    assert.deepEqual(checked(MERGE_REQUEST, ['evals/src/run.ts']), sorted(['unit:tab-recap:lint'], MERGE_REQUEST_JOBS));
});

test('path rules 4c: a gates folder of any unit runs the root unit, which holds the drift test, besides its own unit', () => {
    for (const file of ['packages/recap-view/gates/rules.sh', 'desktop/gates/rules.sh', 'agent-sdk/gates/rules.sh', 'tab-recap/gates/rules.sh', 'packages/session-ledger-sqlite/gates/rules.sh']) {
        assert.ok(checked(MERGE_REQUEST, [file]).includes('unit:root'), file);
    }
});

test('path rules 4d: the sqlite ledger runs the agent-sdk unit, and .oxlintrc.json runs the root unit', () => {
    assert.ok(checked(MERGE_REQUEST, ['packages/session-ledger-sqlite/src/index.ts']).includes('unit:agent-sdk'));
    assert.ok(checked(MERGE_REQUEST, ['.oxlintrc.json']).includes('unit:root'));
});

test('path rules 5: the lockfile runs every unit job and the install smoke', () => {
    assert.deepEqual(checked(MERGE_REQUEST, ['bun.lock']), sorted(UNIT_JOBS, ['install-smoke'], MERGE_REQUEST_JOBS));
});

test('path rules 6: a root README runs no unit job and no install smoke', () => {
    assert.deepEqual(checked(MERGE_REQUEST, ['README.md']), sorted(MERGE_REQUEST_JOBS));
});

test('path rules 7: the default branch, a tag, a schedule and a web run ask for every unit job, and the release jobs find their needs', () => {
    const { jobs } = pipeline();
    const everything = sorted(UNIT_JOBS, ['install-smoke']);
    const branch: Env = { CI_PIPELINE_SOURCE: 'push', CI_COMMIT_BRANCH: 'main', CI_DEFAULT_BRANCH: 'main' };
    const tag: Env = { CI_PIPELINE_SOURCE: 'push', CI_COMMIT_TAG: 'tab-recap-v1.0.0', CI_DEFAULT_BRANCH: 'main' };
    for (const env of [branch, tag, { ...branch, CI_PIPELINE_SOURCE: 'schedule' }, { ...branch, CI_PIPELINE_SOURCE: 'web' }]) {
        const running = jobsThatRun(env, []);
        assert.deepEqual(running.filter((name) => everything.includes(name)), everything);
        const needed = RELEASE_JOBS.filter((name) => running.includes(name)).flatMap((name) => (jobs.get(name)?.needs ?? []).map((need) => (typeof need === 'string' ? need : need.job)));
        assert.deepEqual(needed.filter((need) => !running.includes(need)), []);
    }
    assert.ok(jobsThatRun(branch, []).includes('release:tag'));
    assert.ok(jobsThatRun(tag, []).includes('release-notes'));
});

test('the install smoke runs in a merge request that touches a package.json or the plugin manifest', () => {
    assert.ok(checked(MERGE_REQUEST, ['packages/recap-view/package.json']).includes('install-smoke'));
    assert.ok(checked(MERGE_REQUEST, ['tab-recap/herdr-plugin.toml']).includes('install-smoke'));
});

test('path rules 8: desktop and agent-sdk files run the three plugin jobs, which import their contract and testkit', () => {
    for (const file of ['desktop/src/contract.ts', 'agent-sdk/src/testkit.ts']) {
        const running = checked(MERGE_REQUEST, [file]);
        for (const name of PLUGIN_JOBS) assert.ok(running.includes(name), `${file}: ${name}`);
    }
});

test('path rules 9: the conformance pending files run the ledger unit that reads them', () => {
    assert.ok(checked(MERGE_REQUEST, ['tab-recap/test/conformance/pending-1.json']).includes('unit:session-ledger'));
});

test('path rules 10: the codemod move maps run the plugin test and floor jobs that read them', () => {
    const running = checked(MERGE_REQUEST, ['ci/codemod/moves/ENG-E2b.tsv']);
    assert.ok(running.includes('unit:tab-recap:test'));
    assert.ok(running.includes('unit:tab-recap:floor'));
});

test('the agent-sdk unit type-checks as well as lints and tests', () => {
    const script = (pipelineScript('unit:agent-sdk'));
    assert.ok(script.includes('bash agent-sdk/gates/run.sh typecheck'));
});

function pipelineScript(name: string): readonly string[] {
    const parsed = Bun.YAML.parse(readFileSync(join(repository, '.gitlab-ci.yml'), 'utf8')) as Readonly<Record<string, Scripted>>;
    return parsed[name]?.script ?? [];
}
