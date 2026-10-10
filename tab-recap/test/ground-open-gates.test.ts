import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groundOf } from '#src/recap/application/extract-ground.ts';
import { judge } from '#src/recap/application/ops-gating.ts';
import { inputOf } from '#src/recap/application/recap-input.ts';
import { MemoryLedger } from '#test/fakes/memory-ledger.ts';
import { factOf } from '#test/fakes/facts.ts';
import { keepNewestOf, nextHoursOf, prunedWriterView } from '#src/recap/domain/writer-view.ts';
import type { Operation } from '#src/recap/domain/ops.ts';
import { NO_REPOS } from '#test/support.ts';

const NOW = Date.parse('2026-10-06T03:05:00Z');

test('groundOf and judge refuse an add that repeats an open fact hidden by pruned numbering', async () => {
    const hidden = factOf('done', 'Released tab-recap 1.10.0 through the pipeline', { lastAt: NOW - 2 });
    const shown = factOf('done', 'Keep the release checklist current', { lastAt: NOW - 1 });
    const ledger = new MemoryLedger().seed(hidden, shown);
    const task = { id: 't1', name: '', lanes: [] };
    const view = prunedWriterView(keepNewestOf(1), nextHoursOf(24));
    const built = await inputOf([], { tab: 'w1:t1', repos: NO_REPOS, now: NOW, tasks: [task], facts: [{ key: 't1', open: [hidden, shown], closed: [] }], writerView: view });
    assert.deepEqual(built.input.ledgers[0]?.facts.map((fact) => fact.text), ['Keep the release checklist current']);
    const ground = groundOf({ tab: 'w1:t1', tasks: [task], built, entries: [], ledger, now: NOW, language: 'en' });
    const operation: Operation = { op: 'add', section: 'done', text: hidden.text, why: null, ref: null, at: null, agent: null, anchor: null };
    const taskGround = ground.grounds[0];
    assert.ok(taskGround);
    const result = judge(ground.gates, [operation], taskGround, NOW);
    assert.equal(result.kept.length, 0);
    assert.match(result.refused.find((finding) => finding.gate === 'G2')?.reason ?? '', /already recorded and hidden \("Released tab-recap 1\.10\.0 through the pipeline"\): drop the add/);
    assert.deepEqual(taskGround.open, [shown, hidden]);
    assert.deepEqual(taskGround.shown.size, 1);
});
