import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const ENTRY = 'src/pane/launch.mjs';
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/gu;
const ALLOWED = /^src\/(?:pane|wire)\//u;

interface Violation { readonly rule: { readonly name: string }; readonly from: string; readonly to: string }

interface Closure { readonly files: readonly string[]; readonly outside: readonly string[] }

const specifiersOf = (text: string): readonly string[] => [...text.matchAll(SPECIFIER)].map((match) => match[1] ?? '');

function closureOf(root: string, entry: string): Closure {
    const files = new Set<string>();
    const outside = new Set<string>();
    const queue = [entry];
    for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
        if (files.has(file)) {
            continue;
        }
        files.add(file);
        const text = readFileSync(join(root, file), 'utf8');
        if (/\bBun\./u.test(text)) {
            outside.add(`${file} uses Bun`);
        }
        for (const specifier of specifiersOf(text)) {
            if (specifier.startsWith('node:')) {
                continue;
            }
            const target = specifier.startsWith('.') ? relative(root, resolve(root, dirname(file), specifier)) : specifier.replace(/^#src\//u, 'src/');
            if (ALLOWED.test(target)) {
                queue.push(target);
            } else {
                outside.add(`${file} -> ${specifier}`);
            }
        }
    }
    return { files: [...files].toSorted(), outside: [...outside].toSorted() };
}

function cruise(cwd: string, folder: string): readonly string[] {
    const done = spawnSync(join(ROOT, 'node_modules/.bin/depcruise'), ['--config', join(ROOT, '.dependency-cruiser.cjs'), '--output-type', 'json', folder], { cwd, encoding: 'utf8' });
    const report = JSON.parse(done.stdout) as Readonly<Record<string, { readonly violations: readonly Violation[] } | undefined>>;
    return (report['summary']?.violations ?? []).filter((violation) => violation.rule.name === 'pane-closure').map((violation) => `${violation.from} -> ${violation.to}`);
}

test('the closure of src/pane/launch.mjs holds node:* modules, src/pane and src/wire files only, and no Bun global', () => {
    const closure = closureOf(ROOT, ENTRY);
    assert.deepEqual(closure.outside, []);
    for (const file of ['src/pane/launch.mjs', 'src/pane/relay-main.ts', 'src/pane/relay.ts', 'src/pane/relay-env.ts', 'src/pane/version.ts', 'src/wire/view/connection.ts', 'src/wire/view/codec.ts', 'src/wire/paths.ts']) {
        assert.ok(closure.files.includes(file), file);
    }
    assert.ok(closure.files.every((file) => ALLOWED.test(file)), closure.files.join(' '));
});

test('the closure walker bites: an import of src/daemon, of a package or of bun:sqlite, and a Bun global are reported', () => {
    const root = mkdtempSync(join(tmpdir(), 'pane-closure-'));
    try {
        mkdirSync(join(root, 'src', 'pane'), { recursive: true });
        writeFileSync(join(root, ENTRY), "await import('./relay-main.ts');\n");
        writeFileSync(join(root, 'src/pane/relay-main.ts'), "import { join } from 'node:path';\nimport { stateDir } from '../daemon/config.ts';\nimport { z } from 'zod';\nimport { Database } from 'bun:sqlite';\nimport { own } from '#src/pane/version.ts';\nexport const v = Bun.version;\n");
        writeFileSync(join(root, 'src/pane/version.ts'), "export const own = '1';\n");
        const closure = closureOf(root, ENTRY);
        assert.deepEqual(closure.outside, ['src/pane/relay-main.ts -> ../daemon/config.ts', 'src/pane/relay-main.ts -> bun:sqlite', 'src/pane/relay-main.ts -> zod', 'src/pane/relay-main.ts uses Bun']);
        assert.deepEqual(closure.files, ['src/pane/launch.mjs', 'src/pane/relay-main.ts', 'src/pane/version.ts']);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('the pane-closure rule fires on its bad probe, stays silent on its good probe, and holds on src/pane', () => {
    const probes = join(ROOT, 'ci/probes/depcruise/pane-closure');
    assert.deepEqual(cruise(join(probes, 'bad'), 'src'), ['src/pane/relay.ts -> src/daemon/config.ts']);
    assert.deepEqual(cruise(join(probes, 'good'), 'src'), []);
    assert.deepEqual(cruise(ROOT, 'src/pane'), []);
});
