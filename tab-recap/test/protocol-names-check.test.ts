import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = join(ROOT, 'bin', 'check-protocol-names.ts');

const check = (root?: string): { readonly status: number | null; readonly stderr: string } => {
    const result = spawnSync(process.execPath, root === undefined ? [SCRIPT] : [SCRIPT, root], { encoding: 'utf8' });
    return { status: result.status, stderr: result.stderr };
};

const scratchTree = (file: string, source: string): string => {
    const root = mkdtempSync(join(tmpdir(), 'names-'));
    mkdirSync(join(root, 'src', 'adapters'), { recursive: true });
    writeFileSync(join(root, 'src', 'adapters', file), source);
    return root;
};

test('the tree copies no protocol name outside src/protocol: the check passes', () => {
    assert.deepEqual(check(), { status: 0, stderr: '' });
});

test('a copy of a request prefix in src fails the check, naming the file, the line and the literal', () => {
    const root = scratchTree('leak.ts', "const note = 1;\nconst prefix = 'compact-req-';\n");
    try {
        const result = check(root);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /src\/adapters\/leak\.ts:2: "compact-req-" is a protocol name/);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('a copy of a failure stage in src fails the check: the wire form failed-<reason> is a protocol name too', () => {
    const root = scratchTree('leak.ts', "export const stage = 'failed-not-a-lane';\n");
    try {
        const result = check(root);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /"failed-not-a-lane" is a protocol name/);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});
