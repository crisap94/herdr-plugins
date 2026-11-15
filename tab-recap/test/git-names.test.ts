import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collapsedOf, renamedFrom } from '#src/adapters/git/reach-status.ts';
import { must } from '#src/protocol/result.ts';
import { parseFsPath } from '#src/recap/domain/fs-path.ts';
import { parseGitPath } from '#src/recap/domain/git-path.ts';
import type { GitPath } from '#src/recap/domain/git-path.ts';
import { parseText } from '#src/recap/domain/text.ts';
import type { Text } from '#src/recap/domain/text.ts';

const git = (path: string): GitPath => must(parseGitPath(path));
const text = (value: string): Text => must(parseText(value));
const dirs = (...names: string[]): ReadonlySet<GitPath> => new Set(names.map(git));
const shownOf = (untracked: GitPath[], tracked: ReadonlySet<GitPath>): string[] => must(collapsedOf(untracked, tracked)).map(String);

test('a git path rejects an empty name, a NUL byte, and a leading slash, and keeps a trailing slash', () => {
    assert.equal(parseGitPath('').kind, 'err');
    assert.equal(parseGitPath('a\u0000b').kind, 'err');
    assert.equal(parseGitPath('/abs').kind, 'err');
    assert.equal(parseGitPath('dir/').kind, 'ok');
});

test('a filesystem path rejects an empty name and a NUL byte, and accepts an absolute one', () => {
    assert.equal(parseFsPath('').kind, 'err');
    assert.equal(parseFsPath('x\u0000').kind, 'err');
    assert.equal(parseFsPath('/repo/a.txt').kind, 'ok');
});

test('an untracked directory with no tracked content collapses to its top-most ancestor', () => {
    const shown = shownOf([git('new/deep/a.txt'), git('new/b.txt'), git('kept/c.txt'), git('kept/d/e.txt')], dirs('kept', 'kept/d'));
    assert.deepEqual(shown.toSorted(), ['kept/c.txt', 'kept/d/e.txt', 'new/']);
});

test('a file under a tracked directory is listed as itself', () => {
    assert.deepEqual(shownOf([git('src/new.ts')], dirs('src')), ['src/new.ts']);
});

test('a staged delete and a staged add with the same blob are one rename', () => {
    const from = renamedFrom(
        [{ path: git('old.txt'), oid: text('abc') }],
        [{ path: git('new.txt'), oid: text('abc') }, { path: git('other.txt'), oid: text('def') }],
    );
    assert.deepEqual(from, [git('old.txt')]);
});

test('different blobs are not a rename, and a missing oid never pairs', () => {
    assert.deepEqual(renamedFrom([{ path: git('old.txt'), oid: text('abc') }], [{ path: git('new.txt'), oid: text('zzz') }]), []);
    assert.deepEqual(renamedFrom([{ path: git('old.txt'), oid: null }], [{ path: git('new.txt'), oid: null }]), []);
});
