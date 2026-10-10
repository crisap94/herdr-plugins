import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ranLine, writerViewOf } from '../bin/replay.ts';
import { parseEval } from '#src/recap/application/eval-options.ts';
import { keepNewestOf, nextHoursOf, prunedWriterView } from '#src/recap/domain/writer-view.ts';

test('eval --replay --prune sends the pruned writer view to the replay report', () => {
    const parsed = parseEval(['--replay', '/tmp/run.jsonl', '--prune']);
    if (parsed.kind === 'usage') assert.fail(parsed.why);
    const view = writerViewOf(parsed.options.prune, prunedWriterView(keepNewestOf(10), nextHoursOf(24)));
    const report = ranLine({ windows: 1, facts: [], costUsd: 0 }, { view, pipeline: 'one', writer: 'claude', effort: 'medium', enumerator: null, judge: 'codex', calls: { writer: 1, enumeration: 0 } });
    assert.match(report, /^view pruned ·/);
});
