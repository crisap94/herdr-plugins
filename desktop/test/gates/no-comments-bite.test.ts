import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { checkNoComments, commentsIn } from '../../gates/check-no-comments.ts';

test('a line comment seeded in a mod file is a finding', () => {
    assert.deepEqual(commentsIn('mods/tab-recap/seed.js', 'export const seeded = 1;\n// a seeded comment\n'), [{ file: 'mods/tab-recap/seed.js', line: 2, text: '// a seeded comment' }]);
});

test('a block comment, a JSDoc comment and a comment inside an empty call are findings', () => {
    const text = '/* block */\n/** doc */\nexport function seeded() {}\nseeded(/* inside */);\n';
    assert.deepEqual(
        commentsIn('mods/tab-recap/seed.js', text).map((comment) => comment.text),
        ['/* block */', '/** doc */', '/* inside */'],
    );
});

test('a comment in a declaration file and at the end of a TypeScript file are findings', () => {
    assert.deepEqual(commentsIn('types/seed.d.ts', 'export declare const seeded: number;\n// tail').map((comment) => comment.line), [2]);
    assert.deepEqual(commentsIn('test/seed.ts', 'export const seeded = 1; // trailing\n').map((comment) => comment.text), ['// trailing']);
});

test('a regular expression and a string that hold comment markers are not findings', () => {
    assert.deepEqual(commentsIn('mods/tab-recap/seed.js', 'export const WEB = /^https?:\\/\\//;\nexport const text = "a /* b */ c // d";\n'), []);
});

test('the gate fails on a comment seeded in a scratch tree and passes on the same tree without it', () => {
    const root = mkdtempSync(join(tmpdir(), 'desktop-no-comments-'));
    try {
        mkdirSync(join(root, 'mods', 'tab-recap'), { recursive: true });
        writeFileSync(join(root, 'mods', 'tab-recap', 'clean.js'), 'export const clean = 1;\n');
        assert.deepEqual(checkNoComments(root, ['mods', 'types']), []);
        writeFileSync(join(root, 'mods', 'tab-recap', 'seed.js'), '// a seeded comment\nexport const seeded = 1;\n');
        assert.deepEqual(checkNoComments(root, ['mods', 'types']), [{ file: 'mods/tab-recap/seed.js', line: 1, text: '// a seeded comment' }]);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});
