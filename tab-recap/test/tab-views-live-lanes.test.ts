import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MEMORY } from '#src/adapters/db/connection.ts';
import { openDatabase } from '#src/adapters/db/open.ts';
import { TabViewsRepository } from '#src/adapters/db/tab-views.ts';
import type { LiveLanes, TabLane, TabView, TabViews } from '#src/ports/tab-views.ts';
import { agentKind, paneId, tabId } from '#src/recap/domain/ids.ts';
import { instant } from '#src/recap/domain/time.ts';
import { MemoryTabViews } from './fakes/tab-views-memory.ts';

type Harness = Pick<TabViews, 'writeTab'> & LiveLanes;

const lane = (pane: string, over: Partial<TabLane> = {}): TabLane => ({ pane, agent: 'claude', status: 'idle', title: null, cwd: null, ...over });
const view = (tab: string, lanes: readonly TabLane[]): TabView => ({ tab, column: null, at: 1, lanes });

function sqlite(): Harness {
    const opened = openDatabase(MEMORY);
    if (opened.kind !== 'ready') {
        throw new Error('a fresh in-memory database is never newer');
    }
    return new TabViewsRepository(opened.db);
}

function memory(): Harness {
    return new MemoryTabViews();
}

function suite(name: string, make: () => Harness): void {
    test(`${name}: every tab's lanes are listed in tab then position order, each with its since and directory`, () => {
        const harness = make();
        harness.writeTab(view('w1:t2', [lane('w1:p3', { since: instant(7), cwd: '/w/b' })]));
        harness.writeTab(view('w1:t1', [lane('w1:p2', { cwd: '/w/a' }), lane('w1:p1', { since: instant(5) })]));
        assert.deepEqual(harness.liveLanes(), { kind: 'read', lanes: [
            { tab: tabId('w1:t1'), pane: paneId('w1:p2'), agent: agentKind('claude'), since: null, cwd: '/w/a' },
            { tab: tabId('w1:t1'), pane: paneId('w1:p1'), agent: agentKind('claude'), since: instant(5), cwd: null },
            { tab: tabId('w1:t2'), pane: paneId('w1:p3'), agent: agentKind('claude'), since: instant(7), cwd: '/w/b' },
        ] });
    });

    test(`${name}: a rewrite of a tab replaces its lanes in the listing`, () => {
        const harness = make();
        harness.writeTab(view('w1:t1', [lane('w1:p1', { since: instant(5) }), lane('w1:p2')]));
        harness.writeTab(view('w1:t1', [lane('w1:p3', { since: instant(9) })]));
        assert.deepEqual(harness.liveLanes(), { kind: 'read', lanes: [
            { tab: tabId('w1:t1'), pane: paneId('w1:p3'), agent: agentKind('claude'), since: instant(9), cwd: null },
        ] });
    });

    test(`${name}: a store with no view lists nothing`, () => {
        assert.deepEqual(make().liveLanes(), { kind: 'read', lanes: [] });
    });
}

suite('sqlite', sqlite);
suite('memory', memory);
