import { test } from 'node:test';
import assert from 'node:assert/strict';
import { viewOf } from '#src/recap/application/dispatch.ts';
import { LaneWebs } from '#src/recap/application/lane-webs.ts';
import { emptyBoard } from '#src/recap/domain/board.ts';
import { observe } from '#src/recap/domain/fold.ts';
import { tabId } from '#test/support/ids.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import { DEFAULT_POLICY } from '#src/recap/domain/policy.ts';
import { duration, instant } from '#src/recap/domain/time.ts';
import type { LaneRepo, RepoResult } from '#src/ports/lane-repo.ts';
import { unknown } from '#src/ports/unknowable.ts';
import { must } from '#src/protocol/result.ts';
import { parseDirectory, type Directory } from '#src/recap/domain/directory.ts';
import { parseText, textOf, type Text } from '#src/recap/domain/text.ts';
import { paneId } from '#test/support/ids.ts';
import { reconciliation, seenLane } from '#test/support/seen.ts';
import type { SeenLane } from '#src/recap/domain/lane.ts';

const WEB = { base: must(parseText('https://gitlab.example/acme/shop')), forge: 'gitlab' } as const;
const dir = (path: string): Directory => must(parseDirectory(path));
const branch = (name: string): Text => must(parseText(name));
const lane = (pane: string, cwd: string | null): Lane => laneFrom(seenLane({ paneId: pane, tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', session: 's', cwd }));

function repos(answers: Record<string, RepoResult>): LaneRepo {
    return { repoOf: (cwd) => Promise.resolve(answers[cwd] ?? { kind: 'no-repo' }) };
}

const seen = (pane: string): SeenLane => seenLane({ paneId: pane, tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', status: 'idle', cwd: '/w' });

test('a lane in a repository with an origin gets its web base and branch; the change is reported once', async () => {
    const webs = new LaneWebs(repos({ '/w/shop': { kind: 'repo', root: dir('/w/shop'), branch: branch('feat/cart'), web: WEB } }));
    assert.equal(webs.of(paneId('w1:p1')), null);
    assert.equal(await webs.refresh(lane('w1:p1', '/w/shop')), 'present');
    assert.deepEqual(webs.of(paneId('w1:p1')), { ...WEB, branch: 'feat/cart' });
    assert.equal(await webs.refresh(lane('w1:p1', '/w/shop')), 'absent', 'unchanged');
});

test('a lane with no repository, no origin or no cwd has web null and reports no change; an unknown answer keeps what was known', async () => {
    const webs = new LaneWebs(repos({ '/w/shop': { kind: 'repo', root: dir('/w/shop'), branch: null, web: WEB }, '/w/bare': { kind: 'repo', root: dir('/w/bare'), branch: branch('main'), web: null } }));
    assert.equal(await webs.refresh(lane('w1:p1', '/w/bare')), 'absent');
    assert.equal(await webs.refresh(lane('w1:p2', null)), 'absent');
    assert.equal(await webs.refresh(lane('w1:p3', '/elsewhere')), 'absent');
    assert.equal(await webs.refresh(lane('w1:p4', '/w/shop')), 'present');
    const broken = new LaneWebs({ repoOf: (): Promise<RepoResult> => Promise.resolve(unknown({ why: 'timeout', after: duration(1500) })) });
    assert.equal(await broken.refresh(lane('w1:p4', '/w/shop')), 'absent');
    assert.equal(broken.of(paneId('w1:p4')), null);
    assert.deepEqual(webs.of(paneId('w1:p4')), { ...WEB, branch: null });
});

test('a lane that leaves its repository loses its web context', async () => {
    const answers: Record<string, RepoResult> = { '/w/shop': { kind: 'repo', root: dir('/w/shop'), branch: branch('a'), web: WEB } };
    const webs = new LaneWebs(repos(answers));
    await webs.refresh(lane('w1:p1', '/w/shop'));
    assert.equal(await webs.refresh(lane('w1:p1', '/tmp')), 'present');
    assert.equal(webs.of(paneId('w1:p1')), null);
});

test('viewOf publishes each lane\'s web context, null when unknown', () => {
    const { board } = observe(emptyBoard(), { kind: 'reconciled', seen: reconciliation({ focusedTab: 'w1:t1', lanes: [seen('w1:p1'), seen('w1:p2')], columns: [], panes: ['w1:p1', 'w1:p2'], widths: new Map([['w1:t1', 200]]) }) }, instant(0), DEFAULT_POLICY);
    const view = viewOf(board, tabId('w1:t1'), instant(5), { webs: (pane) => (pane === 'w1:p1' ? { ...WEB, branch: textOf('main') } : null) });
    assert.deepEqual(view.lanes.map((each) => each.web), [{ ...WEB, branch: 'main' }, null]);
    assert.deepEqual(viewOf(board, tabId('w1:t1'), instant(5)).lanes.map((each) => each.web), [null, null], 'a lane with no web source has none');
});
