import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = join(ROOT, 'bin', 'check-domain-types.ts');
const PROBES = join(ROOT, 'ci', 'probes', 'domain-types');

const run = (args: readonly string[]): { readonly status: number | null; readonly stdout: string; readonly stderr: string } => {
    const result = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
};

const probe = (name: string): readonly string[] => ['--project', join(PROBES, name, 'tsconfig.json')];

test('a primitive parameter fails the check with a not supported line naming the file, line, function and parameter', () => {
    const result = run(probe('bad-parameter'));
    assert.equal(result.status, 1);
    assert.match(result.stderr, /^not supported: src\/domain\/value\.ts:1: label, parameter text resolves to string; use a value object or domain type$/m);
});

test('a branded value object and a parser taking unknown pass the check', () => {
    assert.equal(run(probe('good-parser')).status, 0);
    assert.equal(run(probe('good-branded')).status, 0);
});

test('an unannotated callback over a library array is skipped, and a type guard in the value file passes', () => {
    assert.equal(run(probe('good-unannotated-callback')).status, 0);
    assert.equal(run(probe('good-type-guard')).status, 0);
});

test('--json prints each finding with a closed category, sorted by file and line', () => {
    const result = run([...probe('bad-array'), '--json']);
    assert.equal(result.status, 1);
    const parsed: { readonly findings: readonly { readonly category: string; readonly file: string; readonly line: number }[] } = JSON.parse(result.stdout);
    assert.deepEqual(
        parsed.findings.map((finding) => finding.category),
        ['container', 'return'],
    );
    assert.ok(parsed.findings.every((finding) => finding.file === 'src/domain/value.ts' && finding.line === 1));
});

test('an assertion other than as const is counted as the assertion category', () => {
    const result = run([...probe('bad-assertion'), '--json']);
    const parsed: { readonly findings: readonly { readonly category: string; readonly reason: string }[] } = JSON.parse(result.stdout);
    assert.ok(parsed.findings.some((finding) => finding.category === 'assertion' && finding.reason === "as 'a'"));
});

test('a project that does not exist is a could-not-look result, exit 3, never a pass', () => {
    const result = run(['--project', join(PROBES, 'no-such-probe', 'tsconfig.json')]);
    assert.equal(result.status, 3);
    assert.match(result.stdout + result.stderr, /NOT COVERED/);
});

test('--project with no path is a could-not-look result, exit 3', () => {
    const result = run(['--project']);
    assert.equal(result.status, 3);
});

test('a parameter or a return typed by an inline literal union needs a named alias', () => {
    const parameter = run(probe('bad-inline-union-parameter'));
    assert.equal(parameter.status, 1);
    assert.match(parameter.stderr, /^not supported: src\/domain\/value\.ts:1: open, parameter state is an inline literal union; name it with a type alias/m);
    const returned = run(probe('bad-inline-union-return'));
    assert.equal(returned.status, 1);
    assert.match(returned.stderr, /^not supported: src\/domain\/value\.ts:1: state, return is an inline literal union/m);
});

test('a property typed by a literal union, and a named alias in a signature, pass', () => {
    assert.equal(run(probe('good-property-literal-union')).status, 0);
    assert.equal(run(probe('good-named-literal-union')).status, 0);
});
