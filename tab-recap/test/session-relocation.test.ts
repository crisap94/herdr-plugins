import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sessionOfForKind } from '#src/adapters/session-registry.ts';
import { sessionOf } from '#src/recap/application/decode.ts';

const kinds = ['claude', 'codex', 'opencode', 'unknown'] as const;

test('session extraction preserves current id and path outputs for registered and unregistered kinds', () => {
    for (const agent of kinds) {
        assert.equal(sessionOf({ agent, agent_session: { kind: 'id', value: 'session-1' } }, sessionOfForKind), 'session-1');
        assert.equal(sessionOf({ agent, agent_session: { kind: 'path', value: '/tmp/session-2.jsonl' } }, sessionOfForKind), 'session-2');
        assert.equal(sessionOf({ agent, agent_session: { kind: 'path', value: 'C:\\tmp\\session-3.jsonl' } }, sessionOfForKind), 'session-3');
        assert.equal(sessionOf({ agent, agent_session: { kind: 'path', value: '/tmp/session-4.log' } }, sessionOfForKind), 'session-4.log');
    }
});
