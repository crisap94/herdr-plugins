import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { test } from 'node:test';

const root = join(dirname(new URL(import.meta.url).pathname), '..', '..');
const SLOW = { timeout: 120_000 };
const COPIED = ['package.json', 'tsconfig.json', '.oxlintrc.json', '.dependency-cruiser.cjs', 'src', 'test', 'testkit', 'gates', 'rules'];

interface Run {
    readonly status: number | null;
    readonly output: string;
}

function seeded(seed: (unit: string) => void, command: readonly string[]): Run {
    const top = mkdtempSync(join(tmpdir(), 'package-gates-'));
    const unit = join(top, 'packages', basename(root));
    try {
        COPIED.forEach((name) => cpSync(join(root, name), join(unit, name), { recursive: true, filter: (from) => !from.startsWith(join(root, 'test', 'gates')) }));
        symlinkSync(join(root, 'node_modules'), join(unit, 'node_modules'));
        mkdirSync(join(top, 'tab-recap'));
        cpSync(join(root, '..', '..', 'tab-recap', 'CONTEXT.md'), join(top, 'tab-recap', 'CONTEXT.md'));
        seed(unit);
        const [program = 'bash', ...args] = command;
        const run = spawnSync(program, args, { cwd: unit, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
        return { status: run.status, output: `${run.stdout}${run.stderr}` };
    } finally {
        rmSync(top, { recursive: true, force: true });
    }
}

function write(unit: string, file: string, text: string): void {
    mkdirSync(dirname(join(unit, file)), { recursive: true });
    writeFileSync(join(unit, file), text);
}

test('check-boundaries fails on a node:fs import seeded in src/', SLOW, () => {
    const run = seeded((unit) => write(unit, 'src/zz-seed.ts', "import { readFileSync } from 'node:fs';\nexport const read = readFileSync;\n"), ['bun', 'gates/check-boundaries.ts']);
    assert.equal(run.status, 1, run.output);
    assert.match(run.output, /src\/zz-seed\.ts: node:fs is not an allowed built-in/);
});

test('rules.sh fails on a comment seeded in src/', SLOW, () => {
    const run = seeded((unit) => write(unit, 'src/zz-seed.ts', '// a seeded comment\nexport const seeded = 1;\n'), ['bash', 'gates/rules.sh']);
    assert.equal(run.status, 1, run.output);
    assert.match(run.output, /FAIL {2}recap-no-comments — the tree breaks it/);
});

function allow(unit: string, rows: string): void {
    write(unit, 'gates/vocabulary-allow.tsv', rows);
    write(unit, 'gates/config.json', `${JSON.stringify({ ...JSON.parse(readFileSync(join(root, 'gates/config.json'), 'utf8')), vocabularyAllow: 'gates/vocabulary-allow.tsv' }, null, 2)}\n`);
}

function word(unit: string): void {
    write(unit, 'src/zz-seed.ts', 'export const laneOffset = 1;\n');
}

test('rules.sh fails on a vocabulary word above the allowlist and on a stale allowance', SLOW, () => {
    const above = seeded((unit) => { word(unit); allow(unit, ''); }, ['bash', 'gates/rules.sh']);
    assert.equal(above.status, 1, above.output);
    assert.match(above.output, /src\/zz-seed\.ts: offset 1, allowed 0/);
    const held = seeded((unit) => { word(unit); allow(unit, 'src/zz-seed.ts\toffset\t1\n'); }, ['bash', 'gates/rules.sh']);
    assert.equal(held.status, 0, held.output);
    const stale = seeded((unit) => { word(unit); allow(unit, 'src/zz-seed.ts\toffset\t2\n'); }, ['bash', 'gates/rules.sh']);
    assert.equal(stale.status, 1, stale.output);
    assert.match(stale.output, /stale allowance: src\/zz-seed\.ts: offset 1, allowed 2/);
});

test('rules-bite.sh fails when the oxlint unsafe-any bad probe no longer bites', SLOW, () => {
    const run = seeded((unit) => write(unit, 'rules/probes/oxlint-unsafe-any/bad/src/index.ts', 'export const count: number = 1;\n'), ['bash', 'gates/rules-bite.sh']);
    assert.equal(run.status, 1, run.output);
    assert.match(run.output, /oxlint-unsafe-any — the bad probe/);
});

test('verify-bite.sh fails when oxlint no longer rejects the seeded any', SLOW, () => {
    const run = seeded((unit) => {
        const config = JSON.parse(readFileSync(join(unit, '.oxlintrc.json'), 'utf8'));
        write(unit, '.oxlintrc.json', `${JSON.stringify({ ...config, rules: { ...config.rules, 'typescript/no-explicit-any': 'off' } }, null, 2)}\n`);
    }, ['bash', 'gates/verify-bite.sh']);
    assert.equal(run.status, 1, run.output);
    assert.match(run.output, /not rejected:.*no-explicit-any/);
});

test('graph.sh fails on an import cycle seeded in src/', SLOW, () => {
    const run = seeded((unit) => {
        write(unit, 'src/zz-a.ts', "import type { B } from './zz-b.ts';\nexport type A = B | string;\n");
        write(unit, 'src/zz-b.ts', "import type { A } from './zz-a.ts';\nexport type B = A | number;\n");
    }, ['bash', 'gates/graph.sh']);
    assert.equal(run.status, 1, run.output);
    assert.match(run.output, /no-circular: src\/zz-a\.ts -> src\/zz-b\.ts/);
});

test('domain-types.sh fails on a primitive signature seeded in src/ with no baseline row', SLOW, () => {
    const run = seeded((unit) => write(unit, 'src/zz-seed.ts', 'export const length = (text: string): number => text.length;\n'), ['bash', 'gates/domain-types.sh']);
    assert.equal(run.status, 1, run.output);
    assert.match(run.output, /above baseline: src\/zz-seed\.ts: parameter 1, baseline 0/);
});

test('test.sh fails on a failing test seeded in test/', SLOW, () => {
    const run = seeded((unit) => write(unit, 'test/zz-seed.test.ts', "import assert from 'node:assert/strict';\nimport { test } from 'node:test';\n\ntest('seeded', () => {\n    assert.equal(1, 2);\n});\n"), ['bash', 'gates/test.sh']);
    assert.equal(run.status, 1, run.output);
});

test('run.sh lint fails when one runner fails, and names it', SLOW, () => {
    const run = seeded((unit) => write(unit, 'src/index.ts', '// a seeded comment\nexport {};\n'), ['bash', 'gates/run.sh', 'lint']);
    assert.equal(run.status, 1, run.output);
    assert.match(run.output, /FAIL {2}rules \(ast-grep/);
    assert.match(run.output, /lint: 1 finding\(s\)/);
});
