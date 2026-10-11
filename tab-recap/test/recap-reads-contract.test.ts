import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RecapRecords, RecordedRun } from '#src/ports/recap-records.ts';
import type { TabLane, TabViews } from '#src/ports/tab-views.ts';
import { memoryStore } from './db/support.ts';
import { MemoryRunHistory } from './fakes/run-history.ts';
import { MemoryTabViews } from './fakes/tab-views-memory.ts';

interface Subject {
    readonly name: string;
    readonly runs: () => Pick<RecapRecords, 'recordRun' | 'failRun' | 'lastRunOf'>;
    readonly views: () => Pick<TabViews, 'writeTab' | 'tabOf'>;
}

const subjects: readonly Subject[] = [
    { name: 'SQLite', runs: () => memoryStore().records, views: () => memoryStore().views },
    { name: 'in-memory double', runs: () => new MemoryRunHistory(), views: () => new MemoryTabViews() },
];

const run = (tab: string, at: number, cause: 'turn-ended' | 'focused' | 'requested' | 'imported'): RecordedRun => ({ tab, at, cause, backend: null, language: 'en', costUsd: 0, error: null, lanes: [], tasks: [], ops: [] });
const lane = (pane: string): TabLane => ({ pane, agent: 'claude', status: 'idle', title: null, cwd: null });

for (const { name, runs, views } of subjects) {
    test(`${name}: the last good run is the time and cause of the latest run that did not fail`, () => {
        const history = runs();
        assert.equal(history.lastRunOf('w1:t1'), null, 'no run yet');
        history.recordRun(run('w1:t1', 100, 'turn-ended'));
        history.failRun({ ...run('w1:t1', 200, 'requested'), error: 'boom', lanes: [] });
        assert.deepEqual(history.lastRunOf('w1:t1'), { at: 100, cause: 'turn-ended' }, 'a later failed run does not replace it');
        history.recordRun(run('w1:t1', 300, 'requested'));
        assert.deepEqual(history.lastRunOf('w1:t1'), { at: 300, cause: 'requested' });
    });

    test(`${name}: an imported run keeps its cause, and each tab has its own last good run`, () => {
        const history = runs();
        history.recordRun(run('w1:t1', 300, 'focused'));
        history.recordRun(run('w1:t2', 50, 'imported'));
        assert.deepEqual(history.lastRunOf('w1:t2'), { at: 50, cause: 'imported' });
        assert.deepEqual(history.lastRunOf('w1:t1'), { at: 300, cause: 'focused' });
    });

    test(`${name}: a pane maps to the tab its view lists, and a pane that a later view drops maps to none`, () => {
        const tabs = views();
        assert.equal(tabs.tabOf('w1:p1'), null, 'an unknown pane');
        tabs.writeTab({ tab: 'w1:t1', column: null, lanes: [lane('w1:p1')], at: 1 });
        tabs.writeTab({ tab: 'w1:t2', column: null, lanes: [lane('w1:p2')], at: 1 });
        assert.equal(tabs.tabOf('w1:p1'), 'w1:t1');
        assert.equal(tabs.tabOf('w1:p2'), 'w1:t2');
        tabs.writeTab({ tab: 'w1:t1', column: null, lanes: [], at: 2 });
        assert.equal(tabs.tabOf('w1:p1'), null, 'a pane the view no longer lists');
    });
}
