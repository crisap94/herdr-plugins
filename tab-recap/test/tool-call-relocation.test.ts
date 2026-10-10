import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claudeNamedCall } from '#src/adapters/claude-tool-calls.ts';
import { codexCalls } from '#src/adapters/codex-tool-calls.ts';
import { opencodeNamedCall } from '#src/adapters/opencode-tool-calls.ts';
import type { CallKind } from '#src/ports/transcripts.ts';

const claudeNative: readonly (readonly [string, CallKind])[] = [
    ['Bash', 'shell'], ['bash', 'shell'], ['Read', 'read'], ['Grep', 'read'], ['Glob', 'read'], ['LS', 'read'],
    ['Edit', 'edit'], ['Write', 'edit'], ['MultiEdit', 'edit'], ['NotebookEdit', 'edit'], ['WebFetch', 'web'],
    ['WebSearch', 'web'], ['Agent', 'agent'], ['Task', 'agent'],
];

const opencodeNative: readonly (readonly [string, CallKind])[] = [
    ['bash', 'shell'], ['read', 'read'], ['grep', 'read'], ['glob', 'read'], ['list', 'read'], ['edit', 'edit'],
    ['write', 'edit'], ['patch', 'edit'], ['apply_patch', 'edit'], ['webfetch', 'web'], ['websearch', 'web'],
    ['codesearch', 'web'], ['task', 'agent'],
];

test('each transcript adapter classifies every native tool name and treats a foreign name as other', () => {
    for (const [name, kind] of claudeNative) {
        assert.equal(claudeNamedCall(name, {}).kind, kind, name);
    }
    assert.equal(claudeNamedCall('read', {}).kind, 'other');
    for (const [name, kind] of opencodeNative) {
        assert.equal(opencodeNamedCall(name, {}).kind, kind, name);
    }
    assert.equal(opencodeNamedCall('Read', {}).kind, 'other');
    assert.equal(codexCalls('apply_patch', {}, {}).at(0)?.kind, 'edit');
    assert.equal(codexCalls('exec', 'exec_command({cmd:"cat a.ts"})', {}).at(0)?.kind, 'read');
    assert.equal(codexCalls('Read', {}, {}).at(0)?.kind, 'other');
});
