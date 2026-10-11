import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { guard, loadBaseline, parseBaseline, ratchet, writeBaseline } from '../bin/domain-baseline.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRATCH = mkdtempSync(join(tmpdir(), 'domain-baseline-'));

after(() => {
    rmSync(SCRATCH, { recursive: true, force: true });
});

const FILE = 'src/domain/value.ts';
const OTHER = 'src/domain/other.ts';

test('a baseline holds positive whole counts of the closed categories, and nothing at zero', () => {
    assert.equal(parseBaseline({ [FILE]: { parameter: 2, assertion: 1 } }).kind, 'ok');
    assert.equal(parseBaseline({ [FILE]: { parameter: 0 } }).kind, 'err');
    assert.equal(parseBaseline({ [FILE]: { cast: 1 } }).kind, 'err');
    assert.equal(parseBaseline({ [FILE]: {} }).kind, 'err');
    assert.equal(parseBaseline({ [FILE]: { parameter: 1.5 } }).kind, 'err');
    assert.equal(parseBaseline([]).kind, 'err');
});

test('a count above its entry fails, and so does a file with findings and no entry', () => {
    assert.deepEqual(ratchet({ [FILE]: { parameter: 3 } }, { [FILE]: { parameter: 2 } }), [`above baseline: ${FILE}: parameter 3, baseline 2`]);
    assert.deepEqual(ratchet({ [OTHER]: { return: 1 } }, {}), [`above baseline: ${OTHER}: return 1, baseline 0`]);
});

test('a count below its entry fails as stale, and an entry for a clean file is stale', () => {
    assert.match(ratchet({ [FILE]: { parameter: 1 } }, { [FILE]: { parameter: 2 } }).join('\n'), /stale baseline: src\/domain\/value\.ts: parameter 1, baseline 2/u);
    assert.match(ratchet({}, { [FILE]: { return: 1 } }).join('\n'), /stale baseline: src\/domain\/value\.ts: return 0, baseline 1/u);
});

test('a category never pays for another: a fixed assertion does not allow a new parameter', () => {
    const problems = ratchet({ [FILE]: { parameter: 2 } }, { [FILE]: { parameter: 1, assertion: 1 } });
    assert.equal(problems.length, 2);
    assert.match(problems.join('\n'), /above baseline: .*parameter 2, baseline 1/u);
    assert.match(problems.join('\n'), /stale baseline: .*assertion 0, baseline 1/u);
});

test('an equal count passes', () => {
    assert.deepEqual(ratchet({ [FILE]: { parameter: 2, legacy: 1 } }, { [FILE]: { parameter: 2, legacy: 1 } }), []);
});

test('the merge-base guard refuses a raised entry and a new entry, and allows a lowered or deleted one', () => {
    const base = { [FILE]: { parameter: 2, assertion: 1 } };
    assert.deepEqual(guard(base, { [FILE]: { parameter: 3, assertion: 1 } }), [`raised: ${FILE}: parameter 2 -> 3`]);
    assert.deepEqual(guard(base, { ...base, [OTHER]: { return: 1 } }), [`new entry: ${OTHER}: return 1`]);
    assert.deepEqual(guard(base, { [FILE]: { parameter: 1 } }), []);
    assert.deepEqual(guard(base, {}), []);
    assert.deepEqual(guard(base, { [FILE]: { parameter: 2, assertion: 1, return: 1 } }), [`new entry: ${FILE}: return 1`]);
});

test('a lane file holds only the files its lane owns', () => {
    const dir = join(SCRATCH, 'owned');
    mkdirSync(dir);
    writeFileSync(join(dir, 'B1.json'), JSON.stringify({ [OTHER]: { return: 1 } }));
    const loaded = loadBaseline(dir, { B1: [FILE], B2: [OTHER] });
    assert.deepEqual(loaded, { kind: 'err', error: 'B1.json: src/domain/other.ts is not a file of lane B1' });
});

test('the baseline written from counts is read back whole and sorted by lane', () => {
    const dir = join(SCRATCH, 'round');
    const lanes = { B1: [FILE], B2: [OTHER] };
    const counts = { [FILE]: { return: 1, parameter: 2 }, [OTHER]: { assertion: 4 } };
    assert.equal(writeBaseline(dir, counts, lanes).kind, 'ok');
    assert.deepEqual(loadBaseline(dir, lanes), { kind: 'ok', value: counts });
    assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(dir, 'B1.json'), 'utf8'))[FILE]), ['parameter', 'return']);
    assert.equal(writeBaseline(dir, { 'src/domain/lost.ts': { return: 1 } }, lanes).kind, 'err');
});

const project = (name: string, files: Readonly<Record<string, string>>): string => {
    const dir = join(SCRATCH, name);
    mkdirSync(join(dir, 'src/domain'), { recursive: true });
    execFileSync('git', ['init', '-q'], { cwd: dir });
    writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'es2023', lib: ['es2023'], module: 'nodenext', moduleResolution: 'nodenext', types: [], strict: true, noEmit: true, skipLibCheck: true }, include: ['src'] }));
    Object.entries(files).forEach(([file, text]) => writeFileSync(join(dir, file), text));
    writeFileSync(join(dir, 'lanes.json'), JSON.stringify({ lanes: { B1: Object.keys(files).toSorted() } }));
    return dir;
};

const check = (dir: string, ...flags: readonly string[]): ReturnType<typeof spawnSync> =>
    spawnSync(process.execPath, [join(ROOT, 'bin/check-domain-types.ts'), '--project', join(dir, 'tsconfig.json'), '--lanes', join(dir, 'lanes.json'), ...flags], { encoding: 'utf8', cwd: ROOT });

const VALUE = `export type Door = 'a' | 'b';

export function echo(text: string): Door {
    return text as Door;
}
`;

test('the check writes a baseline from the tree and then passes against it', () => {
    const dir = project('write', { [FILE]: VALUE });
    const written = check(dir, '--write-baseline', join(dir, 'baseline'));
    assert.equal(written.status, 0, String(written.stderr));
    assert.deepEqual(JSON.parse(readFileSync(join(dir, 'baseline/B1.json'), 'utf8')), { [FILE]: { parameter: 1, assertion: 1 } });
    assert.equal(check(dir, '--baseline', join(dir, 'baseline')).status, 0);
});

test('a finding added to a counted file fails and names the file and the finding', () => {
    const dir = project('added', { [FILE]: VALUE });
    check(dir, '--write-baseline', join(dir, 'baseline'));
    writeFileSync(join(dir, FILE), `${VALUE}export function second(text: string): 'a' {\n    return 'a';\n}\n`);
    const result = check(dir, '--baseline', join(dir, 'baseline'));
    assert.equal(result.status, 1);
    assert.match(String(result.stderr), /above baseline: src\/domain\/value\.ts: parameter 2, baseline 1/u);
    assert.match(String(result.stderr), /^not supported: src\/domain\/value\.ts:\d+: second/mu);
});

test('a fixed finding without a lowered entry fails as stale', () => {
    const dir = project('fixed', { [FILE]: VALUE });
    check(dir, '--write-baseline', join(dir, 'baseline'));
    writeFileSync(join(dir, FILE), "export type Door = 'a' | 'b';\n\nexport function echo(text: Door): Door {\n    return text;\n}\n");
    const result = check(dir, '--baseline', join(dir, 'baseline'));
    assert.equal(result.status, 1);
    assert.match(String(result.stderr), /stale baseline: src\/domain\/value\.ts: parameter 0, baseline 1/u);
    assert.match(String(result.stderr), /stale baseline: src\/domain\/value\.ts: assertion 0, baseline 1/u);
});

test('an assertion fixed and a parameter added in one file fails on both counts', () => {
    const dir = project('swap', { [FILE]: VALUE });
    check(dir, '--write-baseline', join(dir, 'baseline'));
    writeFileSync(join(dir, FILE), "export function echo(text: string, more: string): 'a' {\n    return 'a';\n}\n");
    const result = check(dir, '--baseline', join(dir, 'baseline'));
    assert.equal(result.status, 1);
    assert.match(String(result.stderr), /above baseline: src\/domain\/value\.ts: parameter 2, baseline 1/u);
    assert.match(String(result.stderr), /stale baseline: src\/domain\/value\.ts: assertion 0, baseline 1/u);
});

test('a file with findings and no entry fails', () => {
    const dir = project('fresh', { [FILE]: VALUE });
    check(dir, '--write-baseline', join(dir, 'baseline'));
    writeFileSync(join(dir, OTHER), "export function plain(text: string): 'a' {\n    return 'a';\n}\n");
    writeFileSync(join(dir, 'lanes.json'), JSON.stringify({ lanes: { B1: [FILE, OTHER] } }));
    const result = check(dir, '--baseline', join(dir, 'baseline'));
    assert.equal(result.status, 1);
    assert.match(String(result.stderr), /above baseline: src\/domain\/other\.ts: parameter 1, baseline 0/u);
});

const repo = (name: string): string => {
    const dir = join(SCRATCH, name);
    mkdirSync(join(dir, 'ci/domain-types-baseline'), { recursive: true });
    const run = (...args: readonly string[]): string => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.test', ...args], { cwd: dir, encoding: 'utf8' });
    run('init', '-q', '-b', 'main');
    writeFileSync(join(dir, 'ci/domain-types-baseline/B1.json'), JSON.stringify({ [FILE]: { parameter: 2 } }));
    run('add', '.');
    run('commit', '-q', '-m', 'base');
    return dir;
};

const guarded = (dir: string): ReturnType<typeof spawnSync> => {
    const base = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();
    return spawnSync(process.execPath, [join(ROOT, 'bin/check-domain-baseline.ts'), 'ci/domain-types-baseline', base], { cwd: dir, encoding: 'utf8' });
};

test('the merge-base guard passes an unchanged baseline and a lowered one', () => {
    const dir = repo('guard-ok');
    assert.equal(guarded(dir).status, 0);
    writeFileSync(join(dir, 'ci/domain-types-baseline/B1.json'), JSON.stringify({ [FILE]: { parameter: 1 } }));
    assert.equal(guarded(dir).status, 0);
});

test('the merge-base guard fails a raised entry and a new entry', () => {
    const dir = repo('guard-bad');
    writeFileSync(join(dir, 'ci/domain-types-baseline/B1.json'), JSON.stringify({ [FILE]: { parameter: 3 } }));
    const raised = guarded(dir);
    assert.equal(raised.status, 1);
    assert.match(String(raised.stderr), /raised: src\/domain\/value\.ts: parameter 2 -> 3/u);
    writeFileSync(join(dir, 'ci/domain-types-baseline/B1.json'), JSON.stringify({ [FILE]: { parameter: 2 }, [OTHER]: { return: 1 } }));
    const added = guarded(dir);
    assert.equal(added.status, 1);
    assert.match(String(added.stderr), /new entry: src\/domain\/other\.ts: return 1/u);
});

test('a change that introduces the baseline folder passes the guard', () => {
    const dir = join(SCRATCH, 'guard-new');
    mkdirSync(dir);
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.test', 'commit', '-q', '--allow-empty', '-m', 'empty'], { cwd: dir });
    mkdirSync(join(dir, 'ci/domain-types-baseline'), { recursive: true });
    writeFileSync(join(dir, 'ci/domain-types-baseline/B1.json'), JSON.stringify({ [FILE]: { parameter: 9 } }));
    assert.equal(guarded(dir).status, 0);
});
