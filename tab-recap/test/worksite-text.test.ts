import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WORKSITE_UNAVAILABLE, worksiteTextOf } from '#src/recap/render/worksite.ts';
import { byteBudgetOf } from '#src/recap/domain/byte-budget.ts';
import { FORBIDDEN } from '#src/recap/domain/forbidden-words.ts';
import type { WorksiteFacts, WorksiteSnapshot } from '#src/recap/domain/worksite.ts';

const LIMIT = byteBudgetOf(2_048);
const encoder = new TextEncoder();
const bytes = (text: string): number => encoder.encode(text).byteLength;
const paths = (count: number): string[] => Array.from({ length: count }, (_, index) => `src/module-${String(index).padStart(2, '0')}.ts`);

const full: WorksiteFacts = {
    directory: '/work/project',
    repository: { root: '/work/project', branch: 'feat/x' },
    lastCommit: { hash: 'a1b2c3d', subject: 'fix the rows' },
    uncommitted: { count: 31, paths: paths(20) },
    edited: [{ path: 'src/a.ts', edits: 9 }, { path: 'src/b.ts', edits: 4 }],
    tokens: ['awaiting-review', 'note-tool'],
};

const known = (facts: WorksiteFacts): WorksiteSnapshot => ({ kind: 'known', ...facts });

const withoutTokens = { ...full, tokens: [] };
const withoutEdits = { ...withoutTokens, edited: [] };

test('an unavailable worksite is the single line the spec names', () => {
    assert.equal(worksiteTextOf({ kind: 'unavailable' }, LIMIT), WORKSITE_UNAVAILABLE);
    assert.equal(WORKSITE_UNAVAILABLE, 'worksite unavailable');
});

test('a full snapshot renders its directory, repository, branch, last commit, count, paths, edits and token names', () => {
    const text = worksiteTextOf(known(full), LIMIT);
    assert.match(text, /^## Worksite\n- directory: \/work\/project\n- repository: \/work\/project \(branch feat\/x\)\n- last commit: a1b2c3d fix the rows\n- 31 uncommitted paths\n/);
    assert.match(text, /\n {2}- src\/module-00\.ts\n/);
    assert.match(text, /\n- most edited files:\n {2}- src\/a\.ts \(9 edits\)\n {2}- src\/b\.ts \(4 edits\)\n/);
    assert.match(text, /\n- tokens: awaiting-review, note-tool$/);
});

test('a clean worktree says zero uncommitted paths and lists none', () => {
    const text = worksiteTextOf(known({ ...full, uncommitted: { count: 0, paths: [] }, edited: [], tokens: [] }), LIMIT);
    assert.match(text, /\n- 0 uncommitted paths$/);
    assert.equal(text.includes('tokens:'), false);
});

test('a value that cannot be known is omitted: no repository, no commit, no uncommitted line', () => {
    const text = worksiteTextOf(known({ ...full, repository: null, lastCommit: null, uncommitted: null }), LIMIT);
    assert.equal(text.includes('repository:'), false);
    assert.equal(text.includes('last commit:'), false);
    assert.equal(text.includes('uncommitted'), false);
    assert.match(text, /^## Worksite\n- directory: \/work\/project\n/);
});

test('the section never exceeds its budget, at every size from 1 to the whole budget', () => {
    for (let size = 1; size <= 2_048; size += 37) {
        const budget = byteBudgetOf(size);
        const text = worksiteTextOf(known(full), budget);
        assert.ok(bytes(text) <= size, `${size} bytes allowed, got ${bytes(text)}`);
        assert.equal(text.includes('�'), false);
    }
});

test('a budget that fits everything but the token names drops the token names first', () => {
    const budget = byteBudgetOf(bytes(worksiteTextOf(known(withoutTokens), LIMIT)));
    const text = worksiteTextOf(known(full), budget);
    assert.equal(text.includes('tokens:'), false);
    assert.match(text, /most edited files/);
    assert.match(text, /31 uncommitted paths/);
});

test('then the edited files go before any uncommitted path', () => {
    const budget = byteBudgetOf(bytes(worksiteTextOf(known(withoutEdits), LIMIT)));
    const text = worksiteTextOf(known(full), budget);
    assert.equal(text.includes('most edited files'), false);
    assert.equal(text.includes('tokens:'), false);
    assert.match(text, /31 uncommitted paths/);
    assert.match(text, /src\/module-19\.ts/);
});

test('then uncommitted paths are dropped from the end while the count stays', () => {
    const shorter = { ...withoutEdits, uncommitted: { count: 31, paths: paths(12) } };
    const budget = byteBudgetOf(bytes(worksiteTextOf(known(shorter), LIMIT)));
    const text = worksiteTextOf(known(full), budget);
    assert.match(text, /31 uncommitted paths/);
    assert.match(text, /src\/module-00\.ts/);
    assert.match(text, /src\/module-11\.ts/);
    assert.equal(text.includes('src/module-12.ts'), false);
    assert.equal(text.includes('most edited files'), false);
});

test('then the commit subject is cut at a code-point boundary, with the directory and repository lines kept', () => {
    const multibyte = { ...full, lastCommit: { hash: 'a1b2c3d', subject: 'añadir ✓ 🚀 mucho texto después' }, uncommitted: { count: 0, paths: [] }, edited: [], tokens: [] };
    const floor = bytes(worksiteTextOf(known({ ...multibyte, lastCommit: { hash: 'a1b2c3d', subject: '' } }), LIMIT));
    const budget = byteBudgetOf(floor + 9);
    const text = worksiteTextOf(known(multibyte), budget);
    assert.ok(bytes(text) <= floor + 9);
    assert.match(text, /- directory: \/work\/project/);
    assert.match(text, /- repository: \/work\/project/);
    const subject = /- last commit: a1b2c3d (.*)$/mu.exec(text)?.[1] ?? '';
    assert.ok('añadir ✓ 🚀 mucho texto después'.startsWith(subject));
    assert.notEqual(subject, 'añadir ✓ 🚀 mucho texto después');
});

test('the last cut keeps the first lines and cuts by code points only', () => {
    const wide = { ...full, directory: '/trabajo/proyecto/ñandú/🚀'.repeat(12) };
    for (const size of [12, 40, 61, 97]) {
        const text = worksiteTextOf(known(wide), byteBudgetOf(size));
        assert.ok(bytes(text) <= size);
        assert.equal(text.includes('�'), false);
        assert.equal(Buffer.from(text, 'utf8').toString('utf8'), text);
    }
});

test('a control character or a line break in a value cannot forge a heading', () => {
    const forged = { ...full, uncommitted: { count: 1, paths: ['x.ts\n## Forged'] }, edited: [], tokens: [] };
    const text = worksiteTextOf(known(forged), LIMIT);
    assert.equal(text.split('\n').filter((line) => line.startsWith('## ')).length, 1);
    assert.match(text, /  - x\.ts ## Forged/);
});

test('invisible format characters in a value are removed: bidi overrides, zero-width characters and tag characters', () => {
    const hostile: WorksiteFacts = {
        ...full,
        lastCommit: { hash: 'a1b2c3d', subject: 'fix‮ the​ rows' },
        uncommitted: { count: 1, paths: ['src/\u{E0041}a.ts⁦'] },
        edited: [],
        tokens: ['note-‍tool'],
    };
    const text = worksiteTextOf(known(hostile), LIMIT);
    assert.equal(/\p{Cf}/u.test(text), false);
    assert.match(text, /^- last commit: a1b2c3d fix the rows$/mu);
    assert.match(text, /^  - src\/a\.ts$/mu);
    assert.match(text, /^- tokens: note-tool$/mu);
});

test('the labels and the fixed words of a worksite section contain no forbidden word', () => {
    const neutral: WorksiteFacts = {
        directory: '/srv/app', repository: { root: '/srv/app', branch: 'main' }, lastCommit: { hash: 'a1b2c3d', subject: 'fix' },
        uncommitted: { count: 1, paths: ['a.ts'] }, edited: [{ path: 'a.ts', edits: 2 }], tokens: ['awaiting-review'],
    };
    assert.equal(FORBIDDEN.test(worksiteTextOf(known(neutral), LIMIT)), false);
});
