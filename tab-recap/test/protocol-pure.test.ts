import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROTOCOL_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'protocol');

const IMPURE: readonly (readonly [string, RegExp])[] = [
    ['Date', /\bDate\b/],
    ['Math.random', /\bMath\.random\b/],
    ['performance', /\bperformance\b/],
    ['setTimeout', /\bsetTimeout\b/],
    ['process.', /\bprocess\./],
    ['crypto', /\bcrypto\b/],
];

interface Finding {
    readonly file: string;
    readonly token: string;
}

function sourcesUnder(dir: string): readonly string[] {
    return readdirSync(dir).toSorted().flatMap((entry) => {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) {
            return sourcesUnder(path);
        }
        return entry.endsWith('.ts') ? [path] : [];
    });
}

function impurityIn(root: string): readonly Finding[] {
    return sourcesUnder(root).flatMap((path) => {
        const text = readFileSync(path, 'utf8');
        return IMPURE.filter(([, pattern]) => pattern.test(text)).map(([token]) => ({ file: relative(root, path), token }));
    });
}

test('the protocol module reads no clock and no random source', () => {
    assert.deepEqual(impurityIn(PROTOCOL_DIR), []);
});

test('the purity scan names the file and the token it finds', () => {
    const root = mkdtempSync(join(tmpdir(), 'protocol-pure-'));
    try {
        mkdirSync(join(root, 'nested'));
        writeFileSync(join(root, 'nested', 'clock.ts'), 'export const now = (): number => Date.now();\n');
        writeFileSync(join(root, 'random.ts'), 'export const pick = (): number => Math.random();\n');
        writeFileSync(join(root, 'clean.ts'), 'export const stamp = 1;\n');
        assert.deepEqual(impurityIn(root), [{ file: join('nested', 'clock.ts'), token: 'Date' }, { file: 'random.ts', token: 'Math.random' }]);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('the purity scan reads a whole word: a name that contains a banned word is not a use of it', () => {
    const root = mkdtempSync(join(tmpdir(), 'protocol-pure-'));
    try {
        writeFileSync(join(root, 'names.ts'), 'export const updateDate = 1;\nexport const performanceBudget = 2;\n');
        assert.deepEqual(impurityIn(root), []);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});
