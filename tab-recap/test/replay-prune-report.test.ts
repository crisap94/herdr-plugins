import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ranLine } from '../bin/replay.ts';

test('the replay report names the writer view as pruned', () => {
    const report = ranLine({ windows: 1, facts: [], costUsd: 0 }, { view: 'pruned', pipeline: 'one', writer: 'claude', effort: 'medium', enumerator: null, judge: 'codex', calls: { writer: 1, enumeration: 0 } });
    assert.match(report, /^view pruned ·/);
});
