import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { connect } from '@stateforge-labs/session-ledger-sqlite/unstable/connection.ts';
import { openDatabase } from '#src/adapters/db/open.ts';
import { fsPathOf } from '#src/recap/domain/fs-path.ts';
import { memoryStore, scratchDir } from './support.ts';
import { countOf } from '@stateforge-labs/session-ledger';
import { duration, instant } from '@stateforge-labs/session-ledger';
import { parseCompactionId } from '#src/recap/domain/ids.ts';
import { agentKind, paneId, tabId } from '#test/support/ids.ts';
import { must } from '@stateforge-labs/session-ledger';
import { textOf } from '@stateforge-labs/session-ledger';

const store = (): ReturnType<typeof memoryStore> => {
    const made = memoryStore();
    made.db.prepare("INSERT INTO tab (id, first_seen, last_seen) VALUES ('w1:t1', 1, 1), ('w1:t2', 1, 1)").run();
    return made;
};
const start = { tab: tabId('w1:t1'), pane: paneId('w1:p1'), agent: agentKind('claude') };

test('begin, advance, finish: a record walks its stages and keeps what each step added, in one row', () => {
    const { compactions } = store();
    const id = compactions.begin({ ...start, stage: 'briefing', at: instant(100), writer: textOf('codex · gpt-6-luna · high') });
    assert.match(id, /^cmp_[0-9a-hjkmnp-tv-z]{26}$/);
    assert.deepEqual(compactions.shownFor(tabId('w1:t1')).map((r) => [r.stage, r.writer, r.stageAt, r.finishedAt]), [['briefing', 'codex · gpt-6-luna · high', 100, null]]);
    compactions.advance(id, 'compacting', { at: instant(108), brief: 'template', templateWhy: textOf('the answer says "tab"') });
    compactions.advance(id, 'restoring', { at: instant(120) });
    const shown = compactions.shownFor(tabId('w1:t1'));
    assert.deepEqual(shown.map((r) => [r.stage, r.brief, r.templateWhy, r.writer, r.startedAt, r.stageAt]), [['restoring', 'template', 'the answer says "tab"', 'codex · gpt-6-luna · high', 100, 120]]);
    compactions.finish(id, { stage: 'compacted', at: instant(130), tokensBefore: countOf(39532), tokensAfter: countOf(3057), took: duration(15588), retry: 'retried' });
    const [done] = compactions.shownFor(tabId('w1:t1'));
    assert.deepEqual([done?.stage, done?.finishedAt, done?.tokensBefore, done?.tokensAfter, done?.took, done?.retry], ['compacted', 130, 39532, 3057, 15588, 'retried']);
    compactions.advance(id, 'compacting', { at: instant(140) });
    compactions.finish(id, { stage: 'failed', at: instant(150), why: textOf('late') });
    assert.equal(compactions.shownFor(tabId('w1:t1'))[0]?.stage, 'compacted', 'an ended record is final');
});

test('a compaction can end where it begins (skipped, with the reason), and a bad id writes nothing', () => {
    const { compactions } = store();
    compactions.begin({ ...start, stage: 'skipped', at: instant(7), why: textOf('working') });
    compactions.advance(must(parseCompactionId('cmp_nonsense')), 'compacting', { at: instant(9) });
    compactions.finish(must(parseCompactionId('cmp_00000000000000000000000000')), { stage: 'failed', at: instant(9) });
    assert.deepEqual(compactions.shownFor(tabId('w1:t1')).map((r) => [r.stage, r.finishedAt, r.why]), [['skipped', 7, 'working']]);
});

test('the newest record of a lane wins, lanes are separate, tabs are separate', () => {
    const { compactions } = store();
    compactions.begin({ ...start, stage: 'skipped', at: instant(10), why: textOf('working') });
    compactions.begin({ ...start, pane: paneId('w1:p2'), agent: agentKind('codex'), stage: 'compacting', at: instant(11) });
    const second = compactions.begin({ ...start, stage: 'compacting', at: instant(12) });
    compactions.begin({ ...start, tab: tabId('w1:t2'), stage: 'compacting', at: instant(13) });
    assert.deepEqual(compactions.shownFor(tabId('w1:t1')).map((r) => [r.pane, r.stage, r.startedAt]), [['w1:p2', 'compacting', 11], ['w1:p1', 'compacting', 12]]);
    compactions.finish(second, { stage: 'compacted', at: instant(14) });
    assert.deepEqual(compactions.shownFor(tabId('w1:t1')).map((r) => r.stage), ['compacting', 'compacted']);
    assert.deepEqual(compactions.shownFor(tabId('w1:t9')), []);
});

test('the agent\'s next turn dismisses an ended record only: not one in progress, not one that ended after the turn began', () => {
    const { compactions } = store();
    const running = compactions.begin({ ...start, stage: 'compacting', at: instant(10) });
    compactions.dismissTurn(tabId('w1:t1'), paneId('w1:p1'), instant(11));
    assert.equal(compactions.shownFor(tabId('w1:t1')).length, 1, 'in progress stays');
    compactions.finish(running, { stage: 'compacted', at: instant(20) });
    compactions.dismissTurn(tabId('w1:t1'), paneId('w1:p1'), instant(20));
    assert.equal(compactions.shownFor(tabId('w1:t1')).length, 1, 'a turn that did not start after the end does not count');
    compactions.dismissTurn(tabId('w1:t1'), paneId('w1:p2'), instant(30));
    assert.equal(compactions.shownFor(tabId('w1:t1')).length, 1, 'another lane\'s turn does not count');
    compactions.dismissTurn(tabId('w1:t1'), paneId('w1:p1'), instant(21));
    assert.deepEqual(compactions.shownFor(tabId('w1:t1')), []);
    compactions.begin({ ...start, stage: 'briefing', at: instant(40) });
    assert.deepEqual(compactions.shownFor(tabId('w1:t1')).map((r) => r.stage), ['briefing'], 'a newer compaction is shown again');
});

test('when the daemon starts, every record still in progress becomes unconfirmed ("the daemon restarted")', () => {
    const { compactions } = store();
    compactions.begin({ ...start, stage: 'briefing', at: instant(1) });
    compactions.begin({ ...start, pane: paneId('w1:p2'), stage: 'restoring', at: instant(2) });
    const done = compactions.begin({ ...start, pane: paneId('w1:p3'), stage: 'compacting', at: instant(3) });
    compactions.finish(done, { stage: 'compacted', at: instant(4) });
    assert.equal(compactions.interrupted(instant(50), textOf('the daemon restarted')), 2);
    assert.deepEqual(compactions.shownFor(tabId('w1:t1')).map((r) => [r.pane, r.stage, r.finishedAt, r.why]), [['w1:p1', 'unconfirmed', 50, 'the daemon restarted'], ['w1:p2', 'unconfirmed', 50, 'the daemon restarted'], ['w1:p3', 'compacted', 4, null]]);
    assert.equal(compactions.interrupted(instant(60), textOf('again')), 0);
});

test('records go with their tab, and a column reading while the daemon writes sees whole rows', () => {
    const { db, compactions } = store();
    compactions.begin({ ...start, stage: 'compacting', at: instant(1) });
    db.prepare("DELETE FROM tab WHERE id = 'w1:t1'").run();
    assert.deepEqual(compactions.shownFor(tabId('w1:t1')), []);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM compaction').get() as { n: number }).n, 0);
    const dir = scratchDir('compaction-wal');
    try {
        const path = join(dir, 'tab-recap.db');
        const writer = openDatabase(fsPathOf(path));
        if (writer.kind !== 'ready') { throw new Error('ready'); }
        writer.db.prepare("INSERT INTO tab (id, first_seen, last_seen) VALUES ('w1:t1', 1, 1)").run();
        assert.equal(connect(path).prepare('SELECT COUNT(*) AS n FROM compaction').get()?.['n'], 0);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('queued: a compaction typed behind a turn is shown queued until the turn ends, and a plain advance leaves the flag alone', () => {
    const { compactions } = store();
    const id = compactions.begin({ ...start, stage: 'briefing', at: instant(10) });
    assert.equal(compactions.shownFor(tabId('w1:t1'))[0]?.queue, 'direct');
    compactions.advance(id, 'compacting', { at: instant(20), queue: 'queued' });
    compactions.advance(id, 'compacting', { at: instant(21), brief: 'written' });
    assert.deepEqual([compactions.shownFor(tabId('w1:t1'))[0]?.stage, compactions.shownFor(tabId('w1:t1'))[0]?.queue], ['compacting', 'queued']);
    compactions.advance(id, 'compacting', { at: instant(30), queue: 'direct' });
    assert.deepEqual([compactions.shownFor(tabId('w1:t1'))[0]?.queue, compactions.shownFor(tabId('w1:t1'))[0]?.stageAt], ['direct', 30]);
});
