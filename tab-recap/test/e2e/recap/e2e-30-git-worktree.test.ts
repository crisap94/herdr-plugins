import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addRemote, branch, commit } from 'isomorphic-git';
import { blankRecap, countOf, duration, instant, NO_SECTIONS, sourcePathOf, cursorOf, textOf } from '@stateforge-labs/session-ledger';
import type { RecapSections, SessionCursor } from '@stateforge-labs/session-ledger';
import { hyperlink } from '@stateforge-labs/recap-view/unstable/hyperlink.ts';
import { plain, visibleLength, wrap } from '@stateforge-labs/recap-view/unstable/wrap.ts';
import { scratchStore } from '#src/adapters/db/scratch.ts';
import { FsGitDirWatcher } from '#src/adapters/git/dir-watch.ts';
import { GitLaneRepo } from '#src/adapters/git/lane-repo.ts';
import { GitWorktreeLocator, GitWorktreeProbe } from '#src/adapters/git/worktree-status.ts';
import { GitWorksite } from '#src/adapters/git/worksite.ts';
import { SystemClock } from '#src/adapters/os/system-clock.ts';
import { en } from '#src/i18n/en.ts';
import type { Count, Text } from '@stateforge-labs/session-ledger';
import type { TabLaneRecord } from '#src/ports/tab-views.ts';
import { LaneWebs } from '#src/recap/application/lane-webs.ts';
import { WorktreeRegistry } from '#src/recap/application/worktree-registry.ts';
import { worksiteOf } from '#src/recap/application/worksite-section.ts';
import { emptyBoard } from '#src/recap/domain/board.ts';
import type { Board } from '#src/recap/domain/board.ts';
import { observe } from '#src/recap/domain/fold.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import { DEFAULT_POLICY } from '#src/recap/domain/policy.ts';
import { present } from '#src/view-model/present.ts';
import type { ColumnView } from '#src/view-model/present.ts';
import { agentKind, paneId } from '#test/support/ids.ts';
import { reconciliation, seenLane } from '#test/support/seen.ts';
import { oneTask } from '#test/support.ts';
import { laneRecord, viewRecord } from '#test/support/tab-view-records.ts';
import { tokenEntries } from '#test/fakes/token-entries.ts';
import { tabId } from '#test/support/ids.ts';
import { AUTHOR, makeLinked, makeRepo, scratch, stage, unstage, type Fixture } from '../../fixtures/git-repo.ts';

const fs = { promises: fsp };
const clock = new SystemClock();

const until = async (done: () => boolean, what: string): Promise<void> => {
    for (let waited = 0; waited < 8000 && !done(); waited += 20) {
        await new Promise<void>((resolve) => { setTimeout(resolve, 20); });
    }
    assert.ok(done(), what);
};
const quiet = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 200); });

const boardOf = (lanes: readonly (readonly [string, string | null])[]): Board => observe(emptyBoard(), {
    kind: 'reconciled',
    seen: reconciliation({
        focusedTab: 'w1:t1', lanes: lanes.map(([pane, cwd]) => seenLane({ paneId: pane, tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', status: 'idle', cwd })),
        columns: [], panes: lanes.map(([pane]) => pane), widths: new Map([['w1:t1', 200]]),
    }),
}, instant(0), DEFAULT_POLICY).board;

const edits = (files: readonly { readonly path: string; readonly count: number }[]): { of: () => Promise<{ path: Text; count: Count }[]> } => ({ of: (): Promise<{ path: Text; count: Count }[]> => Promise.resolve(files.map((file) => ({ path: textOf(file.path), count: countOf(file.count) }))) });
const noGlow = (): null => null;
const laneOf = (pane: string, web: object | null): TabLaneRecord => laneRecord({ pane, agent: 'claude', status: 'idle', title: pane, cwd: '/w', web });
const viewOf = (sections: Partial<RecapSections>, lanes: readonly TabLaneRecord[], style?: ColumnView['style']): ColumnView => ({
    tab: viewRecord({ tab: 'w1:t1', column: null, at: 0, lanes }),
    recap: { ...blankRecap(tabId('w1:t1')), tasks: oneTask('', { ...NO_SECTIONS, ...sections }, lanes.map((each) => each.pane)), at: instant(0) },
    notes: new Map(), warnings: [], now: 0, messages: en, ...(style === undefined ? {} : { style }),
});
const webLane = (cwd: string | null): ReturnType<typeof laneFrom> => laneFrom(seenLane({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', session: 's', cwd }));

const drawn = (view: ColumnView, width = 60): string[] => present(view, width, noGlow);

describe('a lane works in a git repository with a linked worktree', () => {
    let repo: Fixture;
    let linked: string;
    let outside: string;
    const store = scratchStore();
    const status = (pane: string): ReturnType<typeof store.store.worktrees.statusOf> => store.store.worktrees.statusOf(paneId(pane));
    let registry: WorktreeRegistry;
    const attached = (lanes: readonly (readonly [string, string | null])[]): void => { registry.beat(boardOf(lanes)); };

    before(async () => {
        repo = await makeRepo('e2e-30-repo-', { 'a.txt': 'one\n', 'src/keep.ts': 'k\n' });
        linked = await makeLinked(repo.root, 'side');
        outside = mkdtempSync(join(tmpdir(), 'e2e-30-outside-'));
        mkdirSync(join(repo.root, 'src'), { recursive: true });
        registry = new WorktreeRegistry({
            locator: new GitWorktreeLocator(), probe: new GitWorktreeProbe(), watcher: new FsGitDirWatcher(), store: store.store.worktrees, clock,
            perf: { bump: (): void => undefined }, enabled: (): 'on' => 'on', gone: (): void => undefined, settle: duration(30), every: duration(600_000),
        });
    });

    after(() => {
        registry.release();
        store.dispose();
        repo.clean();
        rmSync(outside, { recursive: true, force: true });
    });

    test('the worktree status of a lane that works in a subfolder is read from the repository root: branch, tracked and untracked changes', { timeout: 30_000 }, async () => {
        writeFileSync(join(repo.root, 'a.txt'), 'two two\n');
        writeFileSync(join(repo.root, 'new.txt'), 'x\n');
        attached([['w1:p1', join(repo.root, 'src')]]);
        await until(() => status('w1:p1') !== null, 'the status of the lane');
        const read = status('w1:p1');
        assert.deepEqual([read?.root, String(read?.branch), read?.tracked, read?.untracked], [repo.root, 'main', 1, 1]);
    });

    test('an untracked directory with no tracked content counts as one, and a file under a tracked directory counts as itself', { timeout: 30_000 }, async () => {
        mkdirSync(join(repo.root, 'fresh', 'deep'), { recursive: true });
        writeFileSync(join(repo.root, 'fresh', 'deep', 'a.txt'), 'x\n');
        writeFileSync(join(repo.root, 'fresh', 'b.txt'), 'x\n');
        writeFileSync(join(repo.root, 'src', 'new.ts'), 'x\n');
        attached([['w1:p1', repo.root], ['w1:p9', outside]]);
        attached([['w1:p1', join(repo.root, 'src')]]);
        registry.tick(boardOf([['w1:p1', join(repo.root, 'src')]]));
        await until(() => status('w1:p1')?.untracked === 3, 'the untracked count after the directory');
        assert.equal(status('w1:p1')?.untracked, 3, 'new.txt, fresh/ and src/new.ts');
    });

    test('a staged delete and a staged add of the same content are one rename, not two changes', { timeout: 30_000 }, async () => {
        const lone = await makeRepo('e2e-30-rename-', { 'old.txt': 'same content\n' });
        const localStore = scratchStore();
        const local = new WorktreeRegistry({
            locator: new GitWorktreeLocator(), probe: new GitWorktreeProbe(), watcher: new FsGitDirWatcher(), store: localStore.store.worktrees, clock,
            perf: { bump: (): void => undefined }, enabled: (): 'on' => 'on', gone: (): void => undefined, settle: duration(30), every: duration(600_000),
        });
        try {
            rmSync(join(lone.root, 'old.txt'));
            writeFileSync(join(lone.root, 'new.txt'), 'same content\n');
            await unstage(lone.root, 'old.txt');
            await stage(lone.root, 'new.txt');
            local.beat(boardOf([['w1:p1', lone.root]]));
            await until(() => localStore.store.worktrees.statusOf(paneId('w1:p1')) !== null, 'the status');
            assert.equal(localStore.store.worktrees.statusOf(paneId('w1:p1'))?.tracked, 1);
        } finally {
            local.release();
            localStore.dispose();
            lone.clean();
        }
    });

    test('a linked worktree is its own root, and a lane outside any repository has no status', { timeout: 30_000 }, async () => {
        attached([['w1:p1', join(repo.root, 'src')], ['w1:p2', linked], ['w1:p9', outside], ['w1:p8', join(outside, 'gone')]]);
        await until(() => status('w1:p2') !== null, 'the status of the linked worktree');
        assert.equal(status('w1:p8'), null, 'a directory that is gone is no error and has no status');
        assert.equal(status('w1:p2')?.root, linked);
        assert.equal(status('w1:p9'), null);
        assert.equal(status('w1:p1')?.root, repo.root);
    });

    test('two lanes of one repository share one status', { timeout: 30_000 }, async () => {
        attached([['w1:p1', join(repo.root, 'src')], ['w1:p3', repo.root], ['w1:p2', linked]]);
        await until(() => status('w1:p3') !== null, 'the second lane is bound');
        assert.deepEqual(status('w1:p3'), status('w1:p1'));
    });

    test('a stage, a commit and a branch switch change the status; a lock file and FETCH_HEAD do not', { timeout: 30_000 }, async () => {
        await quiet();
        const base = status('w1:p1')?.at;
        const refLock = join(repo.root, '.git', 'refs', 'heads', 'feat-x.lock');
        writeFileSync(join(repo.root, '.git', 'index.lock'), '');
        writeFileSync(join(repo.root, '.git', 'FETCH_HEAD'), '');
        writeFileSync(refLock, '');
        await quiet();
        rmSync(join(repo.root, '.git', 'index.lock'));
        rmSync(refLock);
        await quiet();
        assert.equal(status('w1:p1')?.at, base, 'a lock file, a lock file under refs and FETCH_HEAD are not changes');
        await stage(repo.root, 'a.txt');
        await until(() => status('w1:p1')?.at !== base, 'the stage was seen');
        const staged = status('w1:p1')?.at;
        await commit({ fs, dir: repo.root, message: 'second', author: AUTHOR });
        await until(() => status('w1:p1')?.at !== staged, 'the commit was seen');
        assert.equal(status('w1:p1')?.tracked, 0);
        const committed = status('w1:p1')?.at;
        await branch({ fs, dir: repo.root, ref: 'feat/x', checkout: true });
        await until(() => status('w1:p1')?.at !== committed, 'the switch was seen');
        assert.equal(String(status('w1:p1')?.branch), 'feat/x');
    });

    test('a lane that moves to another worktree leaves the first; the last lane to leave drops the status and nothing is watched any more', { timeout: 30_000 }, async () => {
        attached([['w1:p1', linked], ['w1:p3', linked], ['w1:p2', linked]]);
        await until(() => status('w1:p1')?.root === linked, 'the lane joined the linked worktree');
        attached([]);
        await until(() => status('w1:p1') === null && status('w1:p2') === null, 'every lane is detached');
        const left = store.store.db.prepare('SELECT COUNT(*) AS n FROM worktree_status').get() as { n: number };
        assert.equal(left.n, 0);
        writeFileSync(join(repo.root, 'late.txt'), 'x\n');
        await quiet();
        assert.equal(status('w1:p1'), null);
    });
});

describe('the worksite section and the lane web come from the repository', () => {
    let repo: Fixture;
    const repos = new GitLaneRepo(clock);
    const reader = new GitWorksite();
    const CURSOR: SessionCursor = { key: paneId('w1:p1'), agent: agentKind('claude'), transcript: sourcePathOf('session.jsonl'), cursor: cursorOf(10), tail: null, title: null, lastPrompt: null, harnessRecap: null };

    before(async () => {
        repo = await makeRepo('e2e-30-worksite-', { 'a.txt': 'one\n' });
        await addRemote({ fs, dir: repo.root, remote: 'origin', url: 'https://gitlab.example/acme/shop.git' });
        await branch({ fs, dir: repo.root, ref: 'feat/cart', checkout: true });
    });

    after(() => {
        repo.clean();
    });

    test('a clean repository gives the directory, repository, branch, last commit and no uncommitted path', { timeout: 30_000 }, async () => {
        const section = await worksiteOf({ reader, repo: repos, edits: edits([]) }, { directory: textOf(repo.root), cursor: CURSOR, tokens: new Map() });
        assert.ok(section.kind === 'known');
        assert.deepEqual([section.directory, section.repository?.root, String(section.repository?.branch), section.lastCommit?.subject, section.uncommitted], [repo.root, repo.root, 'feat/cart', 'first', { count: 0, paths: [] }]);
    });

    test('31 uncommitted paths keep the count and the first 20, and the five most edited files come with their counts', { timeout: 30_000 }, async () => {
        const names = Array.from({ length: 31 }, (_, index) => `f${String(index).padStart(2, '0')}.txt`);
        for (const name of names) {
            writeFileSync(join(repo.root, name), 'y\n');
        }
        const files = Array.from({ length: 7 }, (_, index) => ({ path: `e${index}.ts`, count: 9 - index }));
        const section = await worksiteOf({ reader, repo: repos, edits: edits(files) }, { directory: textOf(repo.root), cursor: CURSOR, tokens: new Map() });
        assert.ok(section.kind === 'known');
        assert.deepEqual([section.uncommitted?.count, section.uncommitted?.paths], [31, names.slice(0, 20)]);
        assert.deepEqual(section.edited.map((file) => [file.path, file.edits]), [['e0.ts', 9], ['e1.ts', 8], ['e2.ts', 7], ['e3.ts', 6], ['e4.ts', 5]]);
    });

    test('a directory that is gone, or none at all, is unavailable; a directory outside any repository has no repository and no branch', { timeout: 30_000 }, async () => {
        const input = { cursor: CURSOR, tokens: new Map() };
        assert.deepEqual(await worksiteOf({ reader, repo: repos, edits: edits([]) }, { ...input, directory: textOf(join(repo.root, 'gone')) }), { kind: 'unavailable' });
        assert.deepEqual(await worksiteOf({ reader, repo: repos, edits: edits([]) }, { ...input, directory: null }), { kind: 'unavailable' });
        const outside = scratch('e2e-30-bare-');
        try {
            const section = await worksiteOf({ reader, repo: repos, edits: edits([]) }, { ...input, directory: textOf(outside.root) });
            assert.ok(section.kind === 'known');
            assert.equal(section.repository, null);
        } finally {
            outside.clean();
        }
    });

    test('a waiting token shows by name and never by value, and an empty one is not listed', { timeout: 30_000 }, async () => {
        const tokens = tokenEntries({ 'awaiting-review': 'secret value', 'awaiting-empty': '', 'note-tool': 'private note', unrelated: 'x' });
        const section = await worksiteOf({ reader, repo: repos, edits: edits([]) }, { directory: textOf(repo.root), cursor: CURSOR, tokens });
        assert.ok(section.kind === 'known');
        assert.deepEqual(section.tokens, ['awaiting-review', 'note-tool']);
        assert.equal(JSON.stringify(section).includes('secret value') || JSON.stringify(section).includes('private note'), false);
    });

    test('the lane takes the web base of the origin and the branch, reports the change once, and loses both when it leaves the repository', { timeout: 30_000 }, async () => {
        const webs = new LaneWebs(repos);
        assert.equal(webs.of(paneId('w1:p1')), null);
        assert.equal(await webs.refresh(webLane(repo.root)), 'present');
        assert.deepEqual(webs.of(paneId('w1:p1')), { base: 'https://gitlab.example/acme/shop', forge: 'gitlab', branch: 'feat/cart' });
        assert.equal(await webs.refresh(webLane(repo.root)), 'absent', 'unchanged');
        assert.equal(await webs.refresh(webLane(null)), 'present');
        assert.equal(webs.of(paneId('w1:p1')), null);
    });
});

describe('the references of a recap are drawn as links', () => {
    const E = String.fromCodePoint(0x1b);
    const open = (url: string): string => `${E}]8;;${url}${E}\\`;
    const CLOSE = `${E}]8;;${E}\\`;
    const BASE = 'https://gitlab.example/acme/shop';
    const web = { base: BASE, forge: 'gitlab', branch: 'feat/cart' } as const;

    test('a merge request, a commit, a file and a URL are drawn as OSC 8 links around the names, and the words stay', { timeout: 30_000 }, () => {
        const text = drawn(viewOf({ done: [textOf('!252 merged in a1b2c3d4')], links: [textOf('`src/cart.ts`'), textOf('https://example.org/docs')] }, [laneOf('w1:p1', web)])).join('\n');
        assert.ok(text.includes(`• ${open(`${BASE}/-/merge_requests/252`)}!252${CLOSE} merged in ${open(`${BASE}/-/commit/a1b2c3d4`)}a1b2c3d4${CLOSE}`));
        assert.ok(text.includes(`• ${open(`${BASE}/-/blob/feat/cart/src/cart.ts`)}src/cart.ts${CLOSE}`));
        assert.ok(text.includes(`• ${open('https://example.org/docs')}https://example.org/docs${CLOSE}`));
        assert.ok(!text.includes('`'), 'the backticks are gone');
    });

    test('links take no cells: the column is as wide with them as without', { timeout: 30_000 }, () => {
        const lane1 = laneOf('w1:p1', web);
        const sections = { done: [textOf('!252 merged in a1b2c3d4, then `src/cart.ts` changed')] };
        const [linkedLines, plainLines] = [drawn(viewOf(sections, [lane1])), drawn(viewOf(sections, [{ ...lane1, web: null }]))];
        assert.deepEqual(linkedLines.map(visibleLength), plainLines.map(visibleLength));
        assert.ok(linkedLines.length > 0 && linkedLines.every((line) => visibleLength(line) <= 60));
    });

    test('NO_COLOR keeps the links and escapes nothing else', { timeout: 30_000 }, () => {
        const text = drawn(viewOf({ done: [textOf('!252 merged')] }, [laneOf('w1:p1', web)], plain)).join('\n');
        assert.ok(text.includes(`${open(`${BASE}/-/merge_requests/252`)}!252${CLOSE}`));
        assert.ok(!text.includes(`${E}[`));
    });

    test('a link that wraps stays a link on every line, to the same address, and no line is wider than the column', { timeout: 30_000 }, () => {
        const url = 'https://example.org/a/very/long/path/that/cannot/fit/on/one/line';
        const pieces = drawn(viewOf({ links: [textOf(url)] }, [laneOf('w1:p1', null)]), 20).filter((line) => line.includes(`${E}]8;;`));
        assert.ok(pieces.length >= 3, 'wrapped over several lines');
        for (const line of pieces) {
            assert.ok(visibleLength(line) <= 20, line);
            assert.ok(line.includes(open(url)) && line.trimEnd().endsWith(CLOSE), `opened and closed on its own line: ${JSON.stringify(line)}`);
        }
        assert.equal(pieces.map((line) => line.replaceAll(open(url), '').replaceAll(CLOSE, '').replace(/^\s*•?\s*/u, '').trim()).join(''), url);
    });

    test('a wrapped word that holds a link and plain text reopens only the link', { timeout: 30_000 }, () => {
        const word = `(${hyperlink('0123456789abcdefghij', 'https://x.example/a')}).`;
        const lines = wrap(word, 8);
        assert.ok(lines.every((line) => visibleLength(line) <= 8));
        assert.equal(lines.map((line) => line.replaceAll(open('https://x.example/a'), '').replaceAll(CLOSE, '')).join(''), '(0123456789abcdefghij).');
        for (const line of lines) {
            assert.equal(line.split(open('https://x.example/a')).length - 1, line.split(CLOSE).length - 1, `balanced: ${JSON.stringify(line)}`);
        }
        assert.ok(lines.at(-1)?.endsWith(').'), 'the punctuation after the link is plain');
    });

    test('with two repositories in one task only full URLs are linked; with one repository the number links', { timeout: 30_000 }, () => {
        const other = { ...web, base: 'https://gitlab.example/acme/other' };
        const sections = { done: [textOf('!7 merged'), textOf('see https://example.org/x')] };
        const mixed = drawn(viewOf(sections, [laneOf('w1:p1', web), laneOf('w1:p2', other)])).join('\n');
        assert.ok(!mixed.includes(open(`${BASE}/-/merge_requests/7`)));
        assert.ok(mixed.includes(open('https://example.org/x')));
        assert.ok(drawn(viewOf(sections, [laneOf('w1:p1', web), laneOf('w1:p2', { ...web, branch: 'main' })])).join('\n').includes(open(`${BASE}/-/merge_requests/7`)));
    });

    test('a flagged link, a description where a reference belongs, is kept as plain text with no hyperlink', { timeout: 30_000 }, () => {
        const text = drawn(viewOf({ links: [textOf('the release notes'), textOf('ctx1'), textOf('!252')] }, [laneOf('w1:p1', web)])).join('\n');
        assert.ok(text.includes('• the release notes') && text.includes('• ctx1'), 'the fact is still there');
        assert.ok(text.includes(`• ${open(`${BASE}/-/merge_requests/252`)}!252${CLOSE}`), 'a real reference beside it is a link');
        assert.equal((text.match(/\]8;;https?:/g) ?? []).length, 1, 'exactly one hyperlink: the description opens none');
    });

    test('a link never carries a control character: the URL ends where the control character starts', { timeout: 30_000 }, () => {
        assert.equal(hyperlink('x', `https://x.example/${E}]52;c;AAAA`), 'x');
        assert.equal(hyperlink('x', 'https://x.example/a\u0007b'), 'x');
        const lines = drawn(viewOf({ links: [textOf(`https://x.example/a${E}b`)] }, [laneOf('w1:p1', web)]));
        const urls = [...lines.join('\n').matchAll(new RegExp(`${E}\\]8;;([^${E}]+)${E}\\\\`, 'gu'))].map((found) => found[1]);
        assert.deepEqual(urls, ['https://x.example/a']);
    });

    test('a link never carries a token: a remote with a token reaches neither the lane web nor the drawn column', { timeout: 30_000 }, async () => {
        const shop = await makeRepo('e2e-30-token-', { 'a.txt': 'x\n' });
        const user = ['fake', 'user'].join('-');
        const secret = ['not', 'a', 'real', 'secret'].join('-');
        try {
            await addRemote({ fs, dir: shop.root, remote: 'origin', url: `https://${user}:${secret}@gitlab.example/acme/shop.git` });
            const webs = new LaneWebs(new GitLaneRepo(clock));
            await webs.refresh(laneFrom(seenLane({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', session: 's', cwd: shop.root })));
            const found = webs.of(paneId('w1:p1'));
            assert.equal(found?.base, BASE);
            const text = drawn(viewOf({ done: [textOf('!3 merged'), textOf('`src/a.ts` in a1b2c3d4')] }, [laneOf('w1:p1', found)])).join('\n');
            assert.ok(text.includes(open(`${BASE}/-/merge_requests/3`)));
            assert.ok(!text.includes(secret) && !text.includes(user) && !JSON.stringify(found).includes(secret));
        } finally {
            shop.clean();
        }
    });
});
