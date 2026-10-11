import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLastCommit, parsePorcelainV2 } from '#src/adapters/git-porcelain.ts';

const NUL = '\0';

test('porcelain v2: ordinary, rename, unmerged and untracked records list their paths in order', () => {
    const text = [
        '1 .M N... 100644 100644 100644 a1 a2 src/a.ts',
        '2 R. N... 100644 100644 100644 b1 b2 R100 new name.ts',
        'old name.ts',
        'u UU N... 100644 100644 100644 100644 c1 c2 c3 conflict.ts',
        '? notes.txt',
        '',
    ].join(NUL);
    assert.deepEqual(parsePorcelainV2(text), ['src/a.ts', 'new name.ts', 'conflict.ts', 'notes.txt']);
});

test('porcelain v2: a rename consumes its original path, which is never listed', () => {
    const text = `2 R. N... 100644 100644 100644 b1 b2 R90 moved.ts${NUL}was.ts${NUL}? extra.ts${NUL}`;
    assert.deepEqual(parsePorcelainV2(text), ['moved.ts', 'extra.ts']);
});

test('porcelain v2: a path with spaces is kept whole', () => {
    assert.deepEqual(parsePorcelainV2(`? docs/my notes v2.md${NUL}`), ['docs/my notes v2.md']);
});

test('porcelain v2: branch headers and an empty output give no paths', () => {
    assert.deepEqual(parsePorcelainV2(`# branch.oid abc${NUL}# branch.head main${NUL}`), []);
    assert.deepEqual(parsePorcelainV2(''), []);
});

test('porcelain v2: 31 entries are all counted, in git order', () => {
    const paths = Array.from({ length: 31 }, (_, index) => `f${index}.txt`);
    assert.deepEqual(parsePorcelainV2(paths.map((path) => `? ${path}`).join(NUL)), paths);
});

test('porcelain v2: a record that does not parse makes the whole output unreadable', () => {
    assert.equal(parsePorcelainV2(`1 .M N...${NUL}`), null);
    assert.equal(parsePorcelainV2(`x weird${NUL}`), null);
});

test('last commit: the short hash and the subject, with the newline git adds dropped', () => {
    assert.deepEqual(parseLastCommit(`a1b2c3d${NUL}fix: keep the rows\n`), { hash: 'a1b2c3d', subject: 'fix: keep the rows' });
});

test('last commit: a subject with a multibyte character is kept as written', () => {
    assert.deepEqual(parseLastCommit(`a1b2c3d${NUL}añadir ✓\n`), { hash: 'a1b2c3d', subject: 'añadir ✓' });
});

test('last commit: output without a hash or a subject is not a commit', () => {
    assert.equal(parseLastCommit(''), null);
    assert.equal(parseLastCommit(`not-a-hash${NUL}subject\n`), null);
    assert.equal(parseLastCommit(`a1b2c3d\n`), null);
});
