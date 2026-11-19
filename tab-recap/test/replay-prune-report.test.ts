import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ranLine, viewOf } from '../bin/replay.ts';
import { parseEval } from '#src/recap/application/eval-options.ts';
import { oneTurnReplay } from '#src/recap/application/replay.ts';
import { keepNewestOf, nextHoursOf, prunedWriterView } from '#src/recap/domain/writer-view.ts';

const config = { writerViewSettings: prunedWriterView(keepNewestOf(10), nextHoursOf(24)) };
const jobs = { pipeline: 'one', mergeTurns: 1, writer: 'claude', effort: 'medium', enumerator: null, judge: 'codex', calls: { writer: 1, enumeration: 0 } };

function reportFor(args: readonly string[]): string {
    const parsed = parseEval(['--replay', '/tmp/run.jsonl', ...args]);
    if (parsed.kind === 'usage') assert.fail(parsed.why);
    return ranLine(oneTurnReplay(), { ...jobs, view: viewOf(parsed.options, config) });
}

test('eval --replay --prune sends the pruned writer view to the replay report', () => {
    assert.match(reportFor(['--prune']), /^view pruned ·/);
});

test('eval --replay without --prune names the full view in the replay report', () => {
    assert.match(reportFor([]), /^view full ·/);
});
