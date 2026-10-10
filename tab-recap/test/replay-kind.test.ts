import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replayKindOf } from '#src/adapters/transcript-registry.ts';

test('a codex transcript path infers the codex reader when no flag is given', () => {
    assert.equal(replayKindOf(null, '/home/u/.codex/sessions/a.jsonl'), 'codex');
});

test('any other transcript path infers the claude reader when no flag is given', () => {
    assert.equal(replayKindOf(null, '/home/u/.claude/projects/a.jsonl'), 'claude');
    assert.equal(replayKindOf(null, '/tmp/a.jsonl'), 'claude');
});

test('an explicit flag wins over the path', () => {
    assert.equal(replayKindOf('codex', '/tmp/a.jsonl'), 'codex');
    assert.equal(replayKindOf('opencode', '/tmp/a.jsonl'), 'opencode');
});

test('an unknown flag names no registered reader', () => {
    assert.equal(replayKindOf('zed', '/tmp/a.jsonl'), null);
    assert.equal(replayKindOf('constructor', '/tmp/a.jsonl'), null);
});
