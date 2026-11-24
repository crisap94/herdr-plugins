import { test } from 'node:test';
import { tokenEntries } from './fakes/token-entries.ts';
import assert from 'node:assert/strict';
import { worksiteOf } from '#src/recap/application/worksite-section.ts';
import type { WorksiteDeps, WorksiteInput } from '#src/recap/application/worksite-section.ts';
import { countOf } from '@stateforge-labs/session-ledger';
import type { Workplaces, RepoResult } from '@stateforge-labs/session-ledger';
import type { SessionCursor } from '@stateforge-labs/session-ledger';
import { unknown } from '@stateforge-labs/session-ledger';
import { must } from '@stateforge-labs/session-ledger';
import { parseDirectory } from '@stateforge-labs/session-ledger';
import { parseText, textOf } from '@stateforge-labs/session-ledger';
import { duration } from '@stateforge-labs/session-ledger';
import type { LastCommitOutcome, UncommittedOutcome } from '#src/ports/worksite-reader.ts';
import type { WorksiteFacts, WorksiteSnapshot } from '#src/recap/domain/worksite.ts';
import { MemoryWorksite } from './fakes/worksite-reader.ts';
import { agentKind, paneId } from '#test/support/ids.ts';
import { sourcePathOf, cursorOf } from '@stateforge-labs/session-ledger';

const DIR = '/work/project';
const CURSOR: SessionCursor = { key: paneId('w1:p1'), agent: agentKind('claude'), transcript: sourcePathOf('session.jsonl'), cursor: cursorOf(10), tail: null, title: null, lastPrompt: null, harnessRecap: null };
const repoAt = (result: RepoResult): Workplaces => ({ repoOf: () => Promise.resolve(result) });
const repo: RepoResult = { kind: 'repo', root: must(parseDirectory('/work/project')), branch: must(parseText('feat/x')), web: null };
const edits = (files: readonly { readonly path: string; readonly count: number }[]): WorksiteDeps['edits'] & { readonly asked: (readonly SessionCursor[])[] } => {
    const asked: SessionCursor[][] = [];
    return { asked, of: (lanes) => { asked.push([...lanes]); return Promise.resolve(files.map((file) => ({ path: textOf(file.path), count: countOf(file.count) }))); } };
};
const knownOf = (snapshot: WorksiteSnapshot): WorksiteFacts => {
    if (snapshot.kind !== 'known') {
        assert.fail('the worksite is unavailable');
    }
    return snapshot;
};
const many = Array.from({ length: 31 }, (_, index) => `f${index}.ts`);

function deps(site: MemoryWorksite, result: RepoResult = repo, files: readonly { readonly path: string; readonly count: number }[] = []): WorksiteDeps {
    return { reader: site, repo: repoAt(result), edits: edits(files) };
}

const input = (overrides: Partial<WorksiteInput> = {}): WorksiteInput => ({ directory: textOf(DIR), cursor: CURSOR, tokens: new Map(), ...overrides });

test('a clean worktree gives the directory, repository, branch, last commit and zero uncommitted paths', async () => {
    const site = new MemoryWorksite();
    site.set(DIR, { commit: { hash: 'a1b2c3d', subject: 'fix rows' }, paths: [] });
    const snapshot = await worksiteOf(deps(site), input());
    assert.deepEqual(snapshot, {
        kind: 'known', directory: DIR, repository: { root: must(parseDirectory('/work/project')), branch: must(parseText('feat/x')) }, lastCommit: { hash: 'a1b2c3d', subject: 'fix rows' },
        uncommitted: { count: 0, paths: [] }, edited: [], tokens: [],
    });
});

test('31 uncommitted paths keep the count and the first 20 in git order', async () => {
    const site = new MemoryWorksite();
    site.set(DIR, { commit: null, paths: many });
    const snapshot = knownOf(await worksiteOf(deps(site), input()));
    const uncommitted = snapshot.uncommitted;
    assert.ok(uncommitted !== null);
    assert.equal(uncommitted.count, 31);
    assert.deepEqual(uncommitted.paths, many.slice(0, 20));
});

test('a directory that no longer exists is unavailable, and the directory is never guessed', async () => {
    assert.deepEqual(await worksiteOf(deps(new MemoryWorksite()), input()), { kind: 'unavailable' });
});

test('a lane with no directory is unavailable', async () => {
    assert.deepEqual(await worksiteOf(deps(new MemoryWorksite()), input({ directory: null })), { kind: 'unavailable' });
});

test('a directory outside any repository has no repository and no branch', async () => {
    const site = new MemoryWorksite();
    site.set(DIR, { commit: null, paths: [] });
    const snapshot = await worksiteOf(deps(site, { kind: 'no-repo' }), input());
    assert.equal(snapshot.kind, 'known');
    assert.equal(snapshot.repository, null);
});

test('a git timeout omits the git values and keeps the rest of the section', async () => {
    const timed = unknown({ why: 'timeout', after: duration(1500) });
    const reader = {
        lastCommit: (): Promise<LastCommitOutcome> => Promise.resolve(timed),
        uncommitted: (): Promise<UncommittedOutcome> => Promise.resolve(timed),
    };
    const snapshot = await worksiteOf({ reader, repo: repoAt(timed), edits: edits([{ path: 'a.ts', count: 2 }]) }, input({ tokens: tokenEntries({ 'awaiting-review': 'yes' }) }));
    assert.deepEqual(snapshot, { kind: 'known', directory: DIR, repository: null, lastCommit: null, uncommitted: null, edited: [{ path: 'a.ts', edits: 2 }], tokens: ['awaiting-review'] });
});

test('the edited files are the top five the edit counter returns, read from the source lane cursor', async () => {
    const site = new MemoryWorksite();
    site.set(DIR, { commit: null, paths: [] });
    const counter = edits(Array.from({ length: 7 }, (_, index) => ({ path: `e${index}.ts`, count: 9 - index })));
    const snapshot = await worksiteOf({ reader: site, repo: repoAt(repo), edits: counter }, input());
    assert.deepEqual(counter.asked, [[CURSOR]]);
    assert.equal(snapshot.kind, 'known');
    assert.deepEqual(snapshot.edited.map((file) => file.path), ['e0.ts', 'e1.ts', 'e2.ts', 'e3.ts', 'e4.ts']);
    assert.deepEqual(snapshot.edited.map((file) => file.edits), [9, 8, 7, 6, 5]);
});

test('no recap cursor for the lane means no edits are read', async () => {
    const site = new MemoryWorksite();
    site.set(DIR, { commit: null, paths: [] });
    const counter = edits([{ path: 'x.ts', count: 1 }]);
    const snapshot = await worksiteOf({ reader: site, repo: repoAt(repo), edits: counter }, input({ cursor: null }));
    assert.deepEqual(counter.asked, [[]]);
    assert.equal(snapshot.kind, 'known');
    assert.deepEqual(snapshot.edited, [{ path: 'x.ts', edits: 1 }]);
});

test('waiting tokens are listed by name, never by value, and an empty one is not listed', async () => {
    const site = new MemoryWorksite();
    site.set(DIR, { commit: null, paths: [] });
    const snapshot = await worksiteOf(deps(site), input({ tokens: tokenEntries({ 'awaiting-review': 'secret value', 'awaiting-empty': '', 'note-tool': 'private note', unrelated: 'x' }) }));
    assert.equal(snapshot.kind, 'known');
    assert.deepEqual(snapshot.tokens, ['awaiting-review', 'note-tool']);
    assert.equal(JSON.stringify(snapshot).includes('secret value'), false);
    assert.equal(JSON.stringify(snapshot).includes('private note'), false);
});

test('unknown tokens leave the token list empty', async () => {
    const site = new MemoryWorksite();
    site.set(DIR, { commit: null, paths: [] });
    const snapshot = await worksiteOf(deps(site), input({ tokens: null }));
    assert.equal(snapshot.kind, 'known');
    assert.deepEqual(snapshot.tokens, []);
});

test('a directory whose last commit is gone is unavailable even when its paths are readable', async () => {
    const reader = {
        lastCommit: (): Promise<LastCommitOutcome> => Promise.resolve(unknown({ why: 'not-found', what: textOf('directory') })),
        uncommitted: (): Promise<UncommittedOutcome> => Promise.resolve({ kind: 'paths', count: countOf(0), paths: [] }),
    };
    assert.deepEqual(await worksiteOf({ reader, repo: repoAt(repo), edits: edits([]) }, input()), { kind: 'unavailable' });
});
