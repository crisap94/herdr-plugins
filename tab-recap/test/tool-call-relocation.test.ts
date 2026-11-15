import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codexCalls } from '#src/adapters/transcripts/codex/tool-calls.ts';
import { namedCall } from '#src/adapters/transcripts/tool-calls.ts';
import type { CallKind } from '#src/ports/transcripts.ts';

const claudeNative: readonly (readonly [string, CallKind])[] = [
    ['Bash', 'shell'], ['bash', 'shell'], ['Read', 'read'], ['Grep', 'read'], ['Glob', 'read'], ['LS', 'read'],
    ['Edit', 'edit'], ['Write', 'edit'], ['MultiEdit', 'edit'], ['NotebookEdit', 'edit'], ['WebFetch', 'web'],
    ['WebSearch', 'web'], ['Agent', 'agent'], ['Task', 'agent'],
];

const opencodeNative: readonly (readonly [string, CallKind])[] = [
    ['bash', 'shell'], ['read', 'read'], ['grep', 'read'], ['glob', 'read'], ['list', 'read'], ['edit', 'edit'],
    ['write', 'edit'], ['patch', 'edit'], ['apply_patch', 'edit'], ['webfetch', 'web'], ['websearch', 'web'],
    ['codesearch', 'web'], ['subagent', 'agent'],
];

test('each transcript adapter classifies every native tool name and treats a foreign name as other', () => {
    for (const [name, kind] of claudeNative) {
        assert.equal(namedCall('claude', name, {}).kind, kind, name);
    }
    assert.equal(namedCall('claude', 'read', {}).kind, 'other');
    for (const [name, kind] of opencodeNative) {
        assert.equal(namedCall('opencode', name, {}).kind, kind, name);
    }
    assert.equal(namedCall('opencode', 'Read', {}).kind, 'other');
    assert.equal(namedCall('opencode', 'task', {}).kind, 'agent');
    assert.equal(codexCalls('apply_patch', {}, {}).at(0)?.kind, 'edit');
    assert.equal(codexCalls('exec', 'exec_command({cmd:"cat a.ts"})', {}).at(0)?.kind, 'read');
    assert.equal(codexCalls('Read', {}, {}).at(0)?.kind, 'other');
});
