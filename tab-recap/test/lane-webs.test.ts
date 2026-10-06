import { test } from 'node:test';
import assert from 'node:assert/strict';
import { viewOf } from '#src/recap/application/dispatch.ts';
import { LaneWebs } from '#src/recap/application/lane-webs.ts';
import { emptyBoard } from '#src/recap/domain/board.ts';
import { observe } from '#src/recap/domain/fold.ts';
import { tabId } from '#src/recap/domain/ids.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import { DEFAULT_POLICY } from '#src/recap/domain/policy.ts';
import { duration, instant } from '#src/recap/domain/time.ts';
import type { LaneRepo, RepoResult } from '#src/ports/lane-repo.ts';
import { unknown } from '#src/ports/unknowable.ts';

const WEB = { base: 'https://gitlab.example/acme/shop', forge: 'gitlab' } as const;
const lane = (pane: string, cwd: string | null): Lane => laneFrom({ paneId: pane, tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', session: 's', cwd });

function repos(answers: Record<string, RepoResult>): LaneRepo {
    return { repoOf: (cwd) => Promise.resolve(answers[cwd] ?? { kind: 'no-repo' }) };
}

const seen = (paneId: string): { paneId: string; tabId: string; workspaceId: string; agent: string; status: string; cwd: string } => ({ paneId, tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', status: 'idle', cwd: '/w' });

test('a lane in a repository with an origin gets its web base and branch; the change is reported once', async () => {
    const webs = new LaneWebs(repos({ '/w/shop': { kind: 'repo', root: '/w/shop', branch: 'feat/cart', web: WEB } }));
    assert.equal(webs.of('w1:p1'), null);
    assert.equal(await webs.refresh(lane('w1:p1', '/w/shop')), true);
    assert.deepEqual(webs.of('w1:p1'), { ...WEB, branch: 'feat/cart' });
    assert.equal(await webs.refresh(lane('w1:p1', '/w/shop')), false, 'unchanged');
});

test('a lane with no repository, no origin or no cwd has web null and reports no change; an unknown answer keeps what was known', async () => {
    const webs = new LaneWebs(repos({ '/w/shop': { kind: 'repo', root: '/w/shop', branch: null, web: WEB }, '/w/bare': { kind: 'repo', root: '/w/bare', branch: 'main', web: null } }));
    assert.equal(await webs.refresh(lane('w1:p1', '/w/bare')), false);
    assert.equal(await webs.refresh(lane('w1:p2', null)), false);
    assert.equal(await webs.refresh(lane('w1:p3', '/elsewhere')), false);
    assert.equal(await webs.refresh(lane('w1:p4', '/w/shop')), true);
    const broken = new LaneWebs({ repoOf: (): Promise<RepoResult> => Promise.resolve(unknown({ why: 'timeout', after: duration(1500) })) });
    assert.equal(await broken.refresh(lane('w1:p4', '/w/shop')), false);
    assert.equal(broken.of('w1:p4'), null);
    assert.deepEqual(webs.of('w1:p4'), { ...WEB, branch: null });
});

test('a lane that leaves its repository loses its web context', async () => {
    const answers: Record<string, RepoResult> = { '/w/shop': { kind: 'repo', root: '/w/shop', branch: 'a', web: WEB } };
    const webs = new LaneWebs(repos(answers));
    await webs.refresh(lane('w1:p1', '/w/shop'));
    assert.equal(await webs.refresh(lane('w1:p1', '/tmp')), true);
    assert.equal(webs.of('w1:p1'), null);
});

test('viewOf publishes each lane\'s web context, null when unknown', () => {
    const { board } = observe(emptyBoard(), { kind: 'reconciled', seen: { focusedTab: 'w1:t1', lanes: [seen('w1:p1'), seen('w1:p2')], columns: [], panes: ['w1:p1', 'w1:p2'], widths: new Map([['w1:t1', 200]]) } }, instant(0), DEFAULT_POLICY);
    const view = viewOf(board, tabId('w1:t1'), 5, { webs: (pane) => (pane === 'w1:p1' ? { ...WEB, branch: 'main' } : null) });
    assert.deepEqual(view.lanes.map((each) => each.web), [{ ...WEB, branch: 'main' }, null]);
    assert.deepEqual(viewOf(board, tabId('w1:t1'), 5).lanes.map((each) => each.web), [null, null], 'a lane with no web source has none');
});
