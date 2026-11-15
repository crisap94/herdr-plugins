import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

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
