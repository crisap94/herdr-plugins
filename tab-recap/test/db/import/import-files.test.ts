import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { importFiles, loadAndCompare } from '#src/adapters/db/import/import-files.ts';
import { LegacyFiles } from '#src/adapters/db/import/legacy-files.ts';
import { canonicalRecap, holdsAnything, recapDifferences, viewDifferences } from '#src/adapters/db/import/equivalence.ts';
import { memoryStore, scratchDir } from '../support.ts';
import { everyShape, put, sections } from './support.ts';

const options = { now: (): number => Date.UTC(2026, 9, 5, 12, 0, 0) };
const count = (store: ReturnType<typeof memoryStore>, table: string): number => (store.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

test('every historical shape imports and reads back equal to what the legacy reader says — recaps, views, hidden, requests', () => {
    const dir = scratchDir('import');
    try {
        everyShape(dir);
        const store = memoryStore();
        const legacy = new LegacyFiles(dir);
        const report = loadAndCompare(store, legacy, 1);
        assert.deepEqual(report.differences, []);
        assert.deepEqual([report.recaps, report.views, report.requests, report.visibility, report.hidden], [6, 3, 1, 2, true], 'the empty recap file is not a recap');
        for (const recap of legacy.recaps().map(canonicalRecap).filter(holdsAnything)) {
            assert.deepEqual(recapDifferences(recap, store.records.readRecap(recap.tab)), [], recap.tab);
        }
        for (const view of legacy.views()) {
            assert.deepEqual(viewDifferences({ ...view, column: view.column ?? null }, store.views.readTab(view.tab)), [], view.tab);
        }
        assert.deepEqual(store.visibility.readHidden(), legacy.readHidden());
        assert.deepEqual(store.requests.takeVisibility(), [{ target: 'w1:t1', hidden: 'toggle' }, { target: 'all', hidden: true }]);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('what the import makes of a few shapes: markdown-only tasks keep their Markdown, a failed first try keeps its error and cost, a run is `imported`', () => {
    const dir = scratchDir('shapes');
    try {
        everyShape(dir);
        const store = memoryStore();
        loadAndCompare(store, new LegacyFiles(dir), 1);
        assert.equal((store.db.prepare("SELECT legacy_markdown FROM run_task rt JOIN task t ON t.id = rt.task_id WHERE t.tab_id = 'w1:t2'").get() as { legacy_markdown: string }).legacy_markdown, '## Goal\n- from the old days');
        assert.deepEqual(store.records.readRecap('w1:t5')?.tasks, []);
        assert.deepEqual([store.records.readRecap('w1:t5')?.error, store.records.readRecap('w1:t5')?.costUsd, store.records.readRecap('w1:t5')?.at], ['the writer failed', 0.5, null]);
        assert.equal(store.records.readRecap('w1:t6')?.running, true);
        assert.equal((store.db.prepare("SELECT DISTINCT cause FROM run").all() as { cause: string }[]).map((row) => row.cause).join(), 'imported');
        assert.equal(store.records.readRecap('w1:t4')?.tasks.at(1)?.markdown.startsWith('## Objetivo'), true);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('the import is one transaction, then the files move aside (never deleted), then a second start does nothing', () => {
    const dir = scratchDir('move');
    try {
        everyShape(dir);
        put(dir, '', 'daemon.pid', '123');
        const store = memoryStore();
        const outcome = importFiles(store, new LegacyFiles(dir), options);
        assert.equal(outcome.kind, 'imported');
        const aside = 'legacy-files-20261005T120000000Z';
        assert.deepEqual(readdirSync(dir).filter((name) => name.startsWith('legacy-files-')), [aside]);
        assert.deepEqual(readdirSync(join(dir, aside)).toSorted(), ['hidden.json', 'recaps', 'requests', 'tabs', 'visibility']);
        assert.ok(existsSync(join(dir, 'daemon.pid')), 'process files stay');
        assert.ok(!existsSync(join(dir, 'recaps')));
        assert.equal(importFiles(store, new LegacyFiles(dir), options).kind, 'already');
        const before = count(store, 'run');
        everyShape(dir);
        assert.equal(importFiles(store, new LegacyFiles(dir), options).kind, 'already', 'files that appear later are not imported again');
        assert.equal(count(store, 'run'), before);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('a crash between the inserts and the commit leaves the files and an empty database; the next start imports', () => {
    const dir = scratchDir('crash');
    try {
        everyShape(dir);
        const store = memoryStore();
        const crashed = importFiles(store, new LegacyFiles(dir), { ...options, afterInsert: (): void => { throw new Error('power cut'); } });
        assert.equal(crashed.kind, 'failed');
        assert.ok(existsSync(join(dir, 'recaps')) && existsSync(join(dir, 'hidden.json')), 'files untouched');
        assert.deepEqual(['tab', 'run', 'transcript', 'request'].map((table) => count(store, table)), [0, 0, 0, 0]);
        assert.equal((store.db.prepare('SELECT files_imported_at AS at FROM store_meta').get() as { at: number | null }).at, null);
        assert.equal(readdirSync(dir).filter((name) => name.startsWith('legacy-files-')).length, 0);
        assert.equal(importFiles(store, new LegacyFiles(dir), options).kind, 'imported', 'the retry works');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('a file the schema refuses (a list over its cap) fails the import, names the tab, and touches nothing', () => {
    const dir = scratchDir('refused');
    try {
        everyShape(dir);
        put(dir, 'recaps', 'w1_t1.json', { tab: 'w1:t1', lanes: [], at: 1, running: false, backend: null, error: null, costUsd: 0, tasks: [{ id: 't1', name: '', lanes: [], sections: { ...sections, done: ['1', '2', '3', '4', '5', '6'] }, markdown: 'x' }] });
        const store = memoryStore();
        const outcome = importFiles(store, new LegacyFiles(dir), options);
        if (outcome.kind !== 'failed') {
            assert.fail('a refused file fails the import');
        }
        assert.match(outcome.why, /recap w1:t1/);
        assert.ok(existsSync(join(dir, 'recaps')));
        assert.equal(count(store, 'tab'), 0);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('a state directory with no files is marked imported and nothing is made; the equivalence check names what differs', () => {
    const dir = scratchDir('empty');
    try {
        const store = memoryStore();
        assert.equal(importFiles(store, new LegacyFiles(dir), options).kind, 'nothing');
        assert.equal(importFiles(store, new LegacyFiles(dir), options).kind, 'already');
        const recap = { tab: 't', lanes: [], tasks: [], at: 5, running: false, backend: null, error: null, costUsd: 1, language: 'en' };
        assert.deepEqual(recapDifferences(recap, { ...recap, at: 6, costUsd: 2 }), ['recap t: at differs', 'recap t: costUsd differs']);
        assert.deepEqual(recapDifferences(recap, { ...recap, costUsd: 1.0000001 }), [], 'money is compared in millionths');
        assert.deepEqual(recapDifferences(recap, null), ['recap t: reads back as nothing']);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
