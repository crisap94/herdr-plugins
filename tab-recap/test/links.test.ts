import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contextOf, linkify } from '#src/recap/render/links.ts';
import type { LaneWeb } from '#src/ports/tab-views.ts';

const GITLAB: LaneWeb = { base: 'https://gitlab.example/acme/shop', forge: 'gitlab', branch: 'feat/cart' };
const GITHUB: LaneWeb = { base: 'https://github.com/acme/shop', forge: 'github', branch: 'feat/cart' };
const SHA = 'a1b2c3d4';

/** `[shown, url]` for every reference, in order; plain text is left out. */
const refs = (text: string, web: LaneWeb | null = GITLAB): [string, string][] =>
    linkify(text, [web]).flatMap((piece) => (piece.url === undefined ? [] : [[piece.text, piece.url] as [string, string]]));

const TABLE: readonly (readonly [string, string, LaneWeb, string])[] = [
    ['a GitLab merge request', '!252 merged', GITLAB, 'https://gitlab.example/acme/shop/-/merge_requests/252'],
    ['a GitLab issue', 'see #7', GITLAB, 'https://gitlab.example/acme/shop/-/issues/7'],
    ['a GitHub pull request', 'see #12', GITHUB, 'https://github.com/acme/shop/pull/12'],
    ['a GitLab commit', `fixed in ${SHA}`, GITLAB, `https://gitlab.example/acme/shop/-/commit/${SHA}`],
    ['a GitHub commit', `fixed in ${SHA}`, GITHUB, `https://github.com/acme/shop/commit/${SHA}`],
    ['a backticked commit', `\`${SHA}\``, GITLAB, `https://gitlab.example/acme/shop/-/commit/${SHA}`],
    ['the lane branch, backticked', '`feat/cart`', GITLAB, 'https://gitlab.example/acme/shop/-/tree/feat/cart'],
    ['the lane branch, bare', 'pushed feat/cart today', GITLAB, 'https://gitlab.example/acme/shop/-/tree/feat/cart'],
    ['another branch, backticked', '`fix/login-bug`', GITHUB, 'https://github.com/acme/shop/tree/fix/login-bug'],
    ['a file', '`src/cart.ts`', GITLAB, 'https://gitlab.example/acme/shop/-/blob/feat/cart/src/cart.ts'],
    ['a file on GitHub', '`src/cart.ts`', GITHUB, 'https://github.com/acme/shop/blob/feat/cart/src/cart.ts'],
    ['a file with a line', '`src/cart.ts:42`', GITLAB, 'https://gitlab.example/acme/shop/-/blob/feat/cart/src/cart.ts#L42'],
    ['a file with ./', '`./README.md`', GITLAB, 'https://gitlab.example/acme/shop/-/blob/feat/cart/README.md'],
    ['a URL', 'docs at https://example.org/a?b=1#c ok', GITLAB, 'https://example.org/a?b=1#c'],
];

for (const [name, text, web, url] of TABLE) {
    test(`links: ${name}`, () => {
        assert.equal(refs(text, web).at(0)?.[1], url);
        assert.equal(refs(text, web).length, 1, 'one reference');
    });
}

test('the visible text of a reference is what was written, backticks dropped', () => {
    assert.deepEqual(refs('`src/cart.ts` and !7'), [['src/cart.ts', 'https://gitlab.example/acme/shop/-/blob/feat/cart/src/cart.ts'], ['!7', 'https://gitlab.example/acme/shop/-/merge_requests/7']]);
    assert.equal(linkify('see `src/cart.ts`, then `npm test`', [GITLAB]).map((piece) => piece.text).join(''), 'see src/cart.ts, then npm test');
});

test('trailing punctuation is not part of a URL; a bracket nothing opened is not either, one that was opened is', () => {
    assert.equal(refs('see https://example.org/a.')[0]?.[1], 'https://example.org/a');
    assert.equal(refs('(see https://example.org/a)')[0]?.[1], 'https://example.org/a');
    assert.equal(refs('https://example.org/a_(b), ok')[0]?.[1], 'https://example.org/a_(b)');
    assert.equal(refs('https://example.org/a?x=1!')[0]?.[1], 'https://example.org/a?x=1');
    assert.equal(linkify('see https://example.org/a.', [null]).map((piece) => piece.text).join(''), 'see https://example.org/a.');
});

test('nothing inside an existing URL is linked again, and a number glued to a word is not a reference', () => {
    assert.deepEqual(refs('https://example.org/-/merge_requests/9#12 and !5').map(([shown]) => shown), ['https://example.org/-/merge_requests/9#12', '!5']);
    assert.deepEqual(refs('abc!5 x#7 &#39; foo!bar'), []);
});

test('a SHA needs seven hex characters with a digit and a letter; words and numbers are left alone', () => {
    assert.deepEqual(refs('deadbeef 12345678 decade abc123 a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0').map(([shown]) => shown), ['a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0']);
    assert.deepEqual(refs('abc1234-rc1 v1.a1b2c3d4 x/a1b2c3d4').map(([shown]) => shown), []);
});

test('backticks decide for paths and branches: a bare path, a command, a directory name or a plain-word branch is not linked', () => {
    assert.deepEqual(refs('edit src/cart.ts, run `npm test`, on main'), []);
    assert.deepEqual(refs('on `main`', { ...GITLAB, branch: 'main' }).map(([, url]) => url), ['https://gitlab.example/acme/shop/-/tree/main']);
    assert.deepEqual(refs('`../secrets.txt` `/etc/passwd` `~/x.md`'), []);
    assert.deepEqual(refs('`release/1.2`').map(([, url]) => url), ['https://gitlab.example/acme/shop/-/tree/release/1.2']);
});

test('a GitHub has no !N; with no branch there are no file or branch pages; with no repository only full URLs link', () => {
    assert.deepEqual(refs('!5', GITHUB), []);
    assert.deepEqual(refs('`src/a.ts` `feat/x` !5', { ...GITLAB, branch: null }).map(([shown]) => shown), ['feat/x', '!5']);
    assert.deepEqual(refs('!5 `src/a.ts` #3 https://example.org/x', null).map(([shown]) => shown), ['https://example.org/x']);
});

test('path pieces of a URL in a ref are percent-encoded', () => {
    assert.equal(refs('`a b/c.ts`', { ...GITLAB, branch: 'feat/x y' }).length, 0, 'a path with a space is no path');
    assert.equal(refs('`src/c.ts`', { ...GITLAB, branch: 'feat/x?y' })[0]?.[1], 'https://gitlab.example/acme/shop/-/blob/feat/x%3Fy/src/c.ts');
});

test('one context per task: lanes of one repository share it, two repositories give nothing, a lane with no web does not veto', () => {
    const other: LaneWeb = { ...GITLAB, base: 'https://gitlab.example/acme/other' };
    assert.deepEqual(contextOf([GITLAB, { ...GITLAB, branch: 'main' }]), { ...GITLAB, branch: null });
    assert.deepEqual(contextOf([GITLAB, null, undefined]), GITLAB);
    assert.equal(contextOf([GITLAB, other]), null);
    assert.equal(contextOf([]), null);
    assert.deepEqual(refs('!7', null), []);
    assert.deepEqual(linkify('!7 https://example.org/z', [GITLAB, other]).flatMap((piece) => (piece.url === undefined ? [] : [piece.url])), ['https://example.org/z']);
});
