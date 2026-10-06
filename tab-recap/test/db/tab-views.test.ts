import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { openStore } from '#src/adapters/db/database.ts';
import type { TabLane, TabView } from '#src/ports/tab-views.ts';
import { memoryStore, must, scratchDir } from './support.ts';

const lane = (pane: string, over: Partial<TabLane> = {}): TabLane => ({ pane, agent: 'claude', status: 'idle', title: null, cwd: null, ...over });
const view = (over: Partial<TabView> = {}): TabView => ({ tab: 'w1:t1', column: null, at: 1, lanes: [lane('w1:p1')], ...over });

test('a view reads back with its lanes in order, cwd and live prompt kept, null where absent', () => {
    const { views } = memoryStore();
    views.writeTab(view({ column: 'w1:p9', lanes: [lane('w1:p2', { cwd: '/w/x', lastPrompt: 'ship it', title: 'T' }), lane('w1:p1')] }));
    const read = must(views.readTab('w1:t1'));
    assert.deepEqual(read.lanes.map((each) => each.pane), ['w1:p2', 'w1:p1']);
    assert.deepEqual([read.column, read.at, read.lanes.at(0)?.cwd, read.lanes.at(0)?.lastPrompt, read.lanes.at(1)?.cwd, read.lanes.at(1)?.lastPrompt], ['w1:p9', 1, '/w/x', 'ship it', null, null]);
});

test('a lane\'s web context reads back; a lane without one has none, and a plain view has web null', () => {
    const { views } = memoryStore();
    views.writeTab(view({ lanes: [lane('w1:p1', { web: { base: 'https://gitlab.example/acme/shop', forge: 'gitlab', branch: 'feat/cart' } }), lane('w1:p2', { web: { base: 'https://github.com/acme/shop', forge: 'github', branch: null } }), lane('w1:p3')] }));
    assert.deepEqual(views.readTab('w1:t1')?.lanes.map((each) => each.web), [
        { base: 'https://gitlab.example/acme/shop', forge: 'gitlab', branch: 'feat/cart' },
        { base: 'https://github.com/acme/shop', forge: 'github', branch: null },
        null,
    ]);
});

test('each write replaces the lanes; an unknown tab, and a tab with only a recap, have no view', () => {
    const { views, records } = memoryStore();
    views.writeTab(view({ lanes: [lane('w1:p1'), lane('w1:p2')] }));
    views.writeTab(view({ at: 2, lanes: [lane('w1:p3')] }));
    assert.deepEqual(views.readTab('w1:t1')?.lanes.map((each) => each.pane), ['w1:p3']);
    assert.equal(views.readTab('missing'), null);
    records.advance({ tab: 'w1:t9', at: 1, error: null, lanes: [] });
    assert.equal(views.readTab('w1:t9'), null);
});

test('a view carries the version of the daemon that wrote it; one written by no daemon reads back null', () => {
    const dir = scratchDir('version');
    try {
        const path = join(dir, 'tab-recap.db');
        const daemon = openStore(path, { daemonVersion: '1.6.0' });
        const other = openStore(path);
        if (daemon.kind !== 'ready' || other.kind !== 'ready') {
            throw new Error('both open');
        }
        daemon.views.writeTab(view());
        other.views.writeTab(view({ tab: 'w1:t2' }));
        assert.equal(other.views.readTab('w1:t1')?.daemonVersion, '1.6.0');
        assert.equal(other.views.readTab('w1:t2')?.daemonVersion, null);
        daemon.close();
        other.close();
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
