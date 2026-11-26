import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groundOf } from '@stateforge-labs/session-ledger';
import { judge } from '@stateforge-labs/session-ledger';
import { inputOf } from '@stateforge-labs/session-ledger';
import { MemoryLedger } from '#test/fakes/memory-ledger.ts';
import { factOf } from '#test/fakes/facts.ts';
import { keepNewestOf, nextHoursOf, prunedWriterView } from '@stateforge-labs/session-ledger';
import type { Operation } from '@stateforge-labs/session-ledger';
import { NO_REPOS } from '#test/support.ts';
import { brand } from '@stateforge-labs/session-ledger';
import { textOf } from '@stateforge-labs/session-ledger';
import { instant } from '@stateforge-labs/session-ledger';

const NOW = Date.parse('2026-10-06T03:05:00Z');

test('groundOf and judge refuse an add that repeats an open fact hidden by pruned numbering', async () => {
    const hidden = factOf('done', 'Released tab-recap 1.10.0 through the pipeline', { lastAt: instant(NOW - 2) });
    const shown = factOf('done', 'Keep the release checklist current', { lastAt: instant(NOW - 1) });
    const ledger = new MemoryLedger().seed(hidden, shown);
    const task = { id: textOf('t1'), name: textOf(''), sessions: [] };
    const view = prunedWriterView(keepNewestOf(1), nextHoursOf(24));
    const built = await inputOf([], { scope: brand<string, 'Text'>('w1:t1'), repos: NO_REPOS, now: brand<number, 'Instant'>(NOW), tasks: [task], facts: [{ key: brand<string, 'Text'>('t1'), open: [hidden, shown], closed: [] }], writerView: view });
    assert.deepEqual(built.input.ledgers[0]?.facts.map((fact) => fact.text), ['Keep the release checklist current']);
    const ground = groundOf({ scope: brand<string, 'Text'>('w1:t1'), tasks: [task], built, entries: [], ledger, now: brand<number, 'Instant'>(NOW), language: brand<string, 'Text'>('en') });
    const operation: Operation = { op: 'add', section: 'done', text: hidden.text, why: null, ref: null, at: null, agent: null, anchor: null };
    const taskGround = ground.grounds[0];
    assert.ok(taskGround);
    const result = judge(ground.gates, [operation], taskGround, brand<number, 'Instant'>(NOW));
    assert.equal(result.kept.length, 0);
    assert.match(result.refused.find((finding) => finding.gate === 'G2')?.reason ?? '', /already recorded and hidden \("Released tab-recap 1\.10\.0 through the pipeline"\): drop the add/);
    assert.deepEqual(taskGround.open, [shown, hidden]);
    assert.deepEqual(taskGround.shown.size, 1);
});
