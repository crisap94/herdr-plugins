import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withJsonVersion, withRelease } from '../ci/apply-release.ts';
import { bumpOf, bumped, entryOf, latestTag, release, renderSection } from '../ci/next-release.ts';
import type { Get, MergeRequest } from '../ci/next-release.ts';

const mr = (iid: number, title: string, labels: readonly string[], extra: Partial<MergeRequest> = {}): MergeRequest =>
    ({ iid, title, state: 'merged', target_branch: 'main', labels, ...extra });

test('the label decides the bump: breaking → major, added → minor, changed/fixed → patch, internal → none', () => {
    const kinds = (...labels: string[]): ReturnType<typeof bumpOf> => bumpOf([entryOf(mr(1, 't', labels))]);
    assert.equal(kinds('changelog::fixed', 'changelog::breaking'), 'major');
    assert.equal(kinds('changelog::added'), 'minor');
    assert.equal(kinds('changelog::changed'), 'patch');
    assert.equal(kinds('changelog::fixed'), 'patch');
    assert.equal(kinds('changelog::internal'), null);
    assert.equal(bumpOf([entryOf(mr(1, 'a', ['changelog::fixed'])), entryOf(mr(2, 'b', ['changelog::added']))]), 'minor');
    assert.equal(bumpOf([]), null);
});

test('an MR with no kind, two kinds, only breaking or an unknown changelog:: label is refused, naming it', () => {
    for (const labels of [[], ['bug'], ['changelog::added', 'changelog::fixed'], ['changelog::breaking'], ['changelog::added', 'changelog::wat']]) {
        assert.throws(() => entryOf(mr(7, 'Title', labels)), /!7 "Title" needs exactly one of/);
    }
});

test('versions bump the right part and reset the lower ones', () => {
    assert.equal(bumped('1.4.9', 'major'), '2.0.0');
    assert.equal(bumped('1.4.9', 'minor'), '1.5.0');
    assert.equal(bumped('1.4.9', 'patch'), '1.4.10');
    assert.throws(() => bumped('1.4', 'patch'));
});

test('the previous tag is the newest by version, not by name', () => {
    assert.equal(latestTag(['tab-recap-v1.9.0', 'tab-recap-v1.10.0', 'other-v9.0.0', 'tab-recap-v1.2.0-rc1', ''], 'tab-recap'), 'tab-recap-v1.10.0');
    assert.equal(latestTag(['other-v1.0.0'], 'tab-recap'), null);
});

test('the section is deterministic: Breaking first, then Added/Changed/Fixed, internal left out, MR title + (!iid)', () => {
    const entries = [
        entryOf(mr(12, 'Fix the tick', ['changelog::fixed'])),
        entryOf(mr(9, 'Hide the column', ['changelog::added'])),
        entryOf(mr(10, 'Rename the key', ['changelog::changed', 'changelog::breaking'])),
        entryOf(mr(11, 'Refactor the fold', ['changelog::internal'])),
    ];
    assert.equal(renderSection('2.0.0', '2026-10-05', entries), [
        '### [2.0.0] — 2026-10-05', '',
        '#### Breaking', '', '- Rename the key (!10)', '',
        '#### Added', '', '- Hide the column (!9)', '',
        '#### Changed', '', '- Rename the key (!10)', '',
        '#### Fixed', '', '- Fix the tick (!12)',
    ].join('\n'));
});

test('release: MRs found through the commits of previous..to, once each, merged into main only', async () => {
    const mrs: Readonly<Record<string, readonly MergeRequest[]>> = {
        c1: [mr(5, 'Add a thing', ['changelog::added'])],
        c2: [mr(5, 'Add a thing', ['changelog::added']), mr(6, 'Fix it', ['changelog::fixed'])],
        c3: [],
        c4: [mr(8, 'Not merged', ['changelog::added'], { state: 'opened' }), mr(9, 'Other branch', [], { target_branch: 'atalaya' })],
    };
    const get: Get = (path) => {
        if (path.startsWith('/repository/compare?from=tab-recap-v1.0.1&to=abc')) {
            return Promise.resolve({ commits: ['c1', 'c2', 'c3', 'c4'].map((id) => ({ id })) });
        }
        const sha = /commits\/(\w+)\/merge_requests/.exec(path)?.[1] ?? '';
        return Promise.resolve(mrs[sha] ?? []);
    };
    const result = await release(get, 'tab-recap-v1.0.1', 'abc', '2026-10-05', 'tab-recap');
    assert.equal(result.version, '1.1.0');
    assert.equal(result.merged, 2);
    assert.match(result.section ?? '', /- Add a thing \(!5\)\n/);
    assert.match(result.section ?? '', /- Fix it \(!6\)/);
    const none = await release(() => Promise.resolve({ commits: [] }), 'tab-recap-v1.0.1', 'abc', '2026-10-05', 'tab-recap');
    assert.equal(none.version, null);
});

const changelog = [
    '# Changelog', '', '## tab-recap', '', '### [Unreleased]', '', '### [1.0.1] — 2026-10-04', '', '#### Fixed', '', '- x', '',
    '[Unreleased]: https://example.invalid/r/compare/tab-recap-v1.0.1...HEAD',
    '[1.0.1]: https://example.invalid/r/compare/tab-recap-v1.0.0...tab-recap-v1.0.1', '',
].join('\n');

test('apply: the section lands under [Unreleased] and the link references follow', () => {
    const out = withRelease(changelog, 'tab-recap', '1.1.0', '### [1.1.0] — 2026-10-05\n\n#### Added\n\n- y (!1)', 'tab-recap-v1.0.1');
    assert.equal(out, [
        '# Changelog', '', '## tab-recap', '', '### [Unreleased]', '', '### [1.1.0] — 2026-10-05', '', '#### Added', '', '- y (!1)', '',
        '### [1.0.1] — 2026-10-04', '', '#### Fixed', '', '- x', '',
        '[Unreleased]: https://example.invalid/r/compare/tab-recap-v1.1.0...HEAD',
        '[1.1.0]: https://example.invalid/r/compare/tab-recap-v1.0.1...tab-recap-v1.1.0',
        '[1.0.1]: https://example.invalid/r/compare/tab-recap-v1.0.0...tab-recap-v1.0.1', '',
    ].join('\n'));
});

test('apply refuses a hand-written [Unreleased] and a changelog without the plugin', () => {
    assert.throws(() => withRelease(changelog.replace('### [Unreleased]\n', '### [Unreleased]\n\n- by hand\n'), 'tab-recap', '1.1.0', '### s', 'v'), /must be empty/);
    assert.throws(() => withRelease(changelog, 'nothing', '1.1.0', '### s', 'v'), /no '## nothing'/);
});

test('apply keeps npm\'s own layout: a lockfile changes only its two versions', () => {
    const lock = `${JSON.stringify({ name: 'p', version: '1.0.0', lockfileVersion: 3, packages: { '': { name: 'p', version: '1.0.0' }, 'node_modules/a': { version: '1.0.0' } } }, null, 2)}\n`;
    assert.equal(withJsonVersion(lock, '1.0.0'), lock);
    const next = JSON.parse(withJsonVersion(lock, '2.0.0'));
    assert.equal(next.version, '2.0.0');
    assert.equal(next.packages[''].version, '2.0.0');
    assert.equal(next.packages['node_modules/a'].version, '1.0.0');
});
