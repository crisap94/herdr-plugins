import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '#src/adapters/db/open.ts';
import { openStore } from '#src/adapters/db/database.ts';
import { MIGRATIONS } from '#src/adapters/db/schema/index.ts';
import { TabViewsRepository } from '#src/adapters/db/tab-views.ts';
import type { TabLane, TabView } from '#src/ports/tab-views.ts';
import { agentKind, paneId, tabId } from '#src/recap/domain/ids.ts';
import { instant } from '#src/recap/domain/time.ts';
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

test('a lane\'s since is written with its view and listed live across tabs; readTab does not carry it', () => {
    const { views } = memoryStore();
    views.writeTab(view({ lanes: [lane('w1:p1', { since: instant(5) }), lane('w1:p2')] }));
    views.writeTab(view({ tab: 'w1:t2', lanes: [lane('w1:p3', { since: instant(7) })] }));
    assert.deepEqual(views.liveLanes(), { kind: 'read', lanes: [
        { tab: tabId('w1:t1'), pane: paneId('w1:p1'), agent: agentKind('claude'), since: instant(5), cwd: null },
        { tab: tabId('w1:t1'), pane: paneId('w1:p2'), agent: agentKind('claude'), since: null, cwd: null },
        { tab: tabId('w1:t2'), pane: paneId('w1:p3'), agent: agentKind('claude'), since: instant(7), cwd: null },
    ] });
    assert.equal(Object.keys(must(views.readTab('w1:t1')).lanes[0] ?? {}).includes('since'), false);
});

test('a read-only open of a database below the since column lists no lanes and still reads the views', () => {
    const dir = scratchDir('views-before-since');
    try {
        const path = join(dir, 'tab-recap.db');
        const old = openDatabase(path, MIGRATIONS.slice(0, 18));
        if (old.kind !== 'ready') {
            throw new Error('a fresh file is never newer');
        }
        old.db.exec("INSERT INTO tab (id, first_seen, last_seen, view_at) VALUES ('w1:t1', 1, 1, 1)");
        old.db.exec("INSERT INTO lane (tab_id, pane, position, agent, status) VALUES ('w1:t1', 'w1:p1', 0, 'claude', 'idle')");
        old.db.close();
        const reader = new DatabaseSync(path, { readOnly: true });
        const views = new TabViewsRepository(reader);
        assert.deepEqual(views.liveLanes(), { kind: 'read', lanes: [] });
        assert.equal(must(views.readTab('w1:t1')).lanes.length, 1);
        reader.close();
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('a write to a database below the since column keeps the old lane shape', () => {
    const dir = scratchDir('views-write-before-since');
    try {
        const path = join(dir, 'tab-recap.db');
        const old = openDatabase(path, MIGRATIONS.slice(0, 18));
        if (old.kind !== 'ready') {
            throw new Error('a fresh file is never newer');
        }
        old.db.close();
        const writer = new DatabaseSync(path);
        const views = new TabViewsRepository(writer);
        views.writeTab(view({ lanes: [lane('w1:p1', { since: instant(5) })] }));
        assert.deepEqual(views.liveLanes(), { kind: 'read', lanes: [] });
        assert.equal(must(views.readTab('w1:t1')).lanes.at(0)?.pane, 'w1:p1');
        writer.close();
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
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
