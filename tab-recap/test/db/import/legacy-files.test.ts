import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { LegacyFiles } from '#src/adapters/db/import/legacy-files.ts';
import { scratchDir } from '../support.ts';
import { everyShape, lane, put, sections } from './support.ts';

test('the legacy reader knows every shape a file was ever stored in', () => {
    const dir = scratchDir('legacy');
    try {
        everyShape(dir);
        const legacy = new LegacyFiles(dir);
        const recap = (tab: string): ReturnType<LegacyFiles['recaps']>[number] | undefined => legacy.recaps().find((each) => each.tab === tab);
        assert.equal(legacy.recaps().length, 7);
        assert.deepEqual(recap('w1:t1')?.tasks.at(0)?.sections, sections);
        assert.deepEqual(recap('w1:t2')?.tasks, [{ id: 't1', name: '', lanes: ['w1:p1'], sections: null, markdown: '## Goal\n- from the old days' }], 'before tasks and sections: ONE task holding every lane, markdown only');
        assert.equal(recap('w1:t2')?.language, 'en', 'no language is English');
        assert.deepEqual(recap('w1:t3')?.tasks.at(0)?.sections, sections, 'before tasks, after sections');
        assert.equal(recap('w1:t4')?.lanes.at(0)?.tail, null, 'a cursor without a tail');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('the legacy reader knows a view written before cwd, the live prompt and the daemon version, and one with no lanes', () => {
    const dir = scratchDir('views');
    try {
        everyShape(dir);
        const views = new LegacyFiles(dir).views();
        assert.deepEqual(views.find((view) => view.tab === 'w1:t2')?.lanes.at(0), { pane: 'w1:p1', agent: 'claude', status: 'working', title: null, cwd: null, lastPrompt: null, web: null });
        assert.equal(views.find((view) => view.tab === 'w1:t2')?.daemonVersion, null);
        assert.deepEqual(views.find((view) => view.tab === 'w1:t8')?.lanes, [], 'a view with no lanes');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('damaged sections read as null, half-damaged ones keep what is text; pending requests are seen, not taken', () => {
    const dir = scratchDir('damaged');
    try {
        put(dir, 'recaps', 'bad.json', { tab: 'bad', lanes: [], sections: 'oops', markdown: 'y', at: 1, running: false, backend: null, error: null, costUsd: 0 });
        put(dir, 'recaps', 'half.json', { tab: 'half', lanes: [lane], sections: { goal: 5, now: ['a', 7] }, markdown: 'y', at: 1, running: false, backend: null, error: null, costUsd: 0 });
        put(dir, 'recaps', 'junk.json', 'not json');
        put(dir, 'requests', 'w1_t1', 'w1:t1');
        put(dir, 'visibility', '1.json', { target: 5 });
        put(dir, 'visibility', '2.json', { target: 'w1:t1', hidden: 'maybe' });
        put(dir, 'visibility', '3.json', { target: 'w1:t1', hidden: false });
        const legacy = new LegacyFiles(dir);
        assert.equal(legacy.recaps().find((recap) => recap.tab === 'bad')?.tasks.at(0)?.sections, null);
        assert.deepEqual(legacy.recaps().find((recap) => recap.tab === 'half')?.tasks.at(0)?.sections, { goal: '', now: ['a'], needs: [], done: [], decisions: [], next: [], links: [] });
        assert.equal(legacy.recaps().length, 2, 'a file that is not JSON is not a recap');
        assert.deepEqual([legacy.pendingRequests(), legacy.pendingVisibility()], [['w1:t1'], [{ target: 'w1:t1', hidden: false }]]);
        assert.deepEqual(legacy.pendingRequests(), ['w1:t1'], 'still there');
        put(dir, '', 'hidden.json', '{"all":"yes","hidden":[1,"w1:t5"],"shown":null}');
        assert.deepEqual(legacy.readHidden(), { all: false, hidden: ['w1:t5'], shown: [] });
        assert.equal(new LegacyFiles(scratchDir('none')).exists(), false);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
