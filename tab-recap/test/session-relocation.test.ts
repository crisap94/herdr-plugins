import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sessionOfForKind } from '#src/adapters/session-registry.ts';
import { decode, paneSessionOf, seenFrom, sessionOf } from '#src/recap/application/decode.ts';

const kinds = ['claude', 'codex', 'opencode', 'unknown'] as const;

test('session extraction preserves current id and path outputs for registered and unregistered kinds', () => {
    for (const agent of kinds) {
        assert.equal(sessionOf({ agent, agent_session: { kind: 'id', value: 'session-1' } }, sessionOfForKind), 'session-1');
        assert.equal(sessionOf({ agent, agent_session: { kind: 'path', value: '/tmp/session-2.jsonl' } }, sessionOfForKind), 'session-2');
        assert.equal(sessionOf({ agent, agent_session: { kind: 'path', value: 'C:\\tmp\\session-3.jsonl' } }, sessionOfForKind), 'session-3');
        assert.equal(sessionOf({ agent, agent_session: { kind: 'path', value: '/tmp/session-4.log' } }, sessionOfForKind), 'session-4.log');
        assert.equal(sessionOf({ agent, agent_session: { kind: 'id', value: ' ' } }, sessionOfForKind), ' ');
        assert.equal(sessionOf({ agent, agent_session: { kind: 'path', value: ' ' } }, sessionOfForKind), ' ');
        for (const value of ['/tmp/', '.jsonl', '/tmp/.jsonl', '/tmp\\', 'a.jsonl/']) {
            assert.equal(sessionOf({ agent, agent_session: { kind: 'path', value } }, sessionOfForKind), '');
        }
    }
});

test('degenerate session values remain total through every decoder entry point', () => {
    const idData = { pane_id: 'p', tab_id: 't', workspace_id: 'w', agent: 'claude', agent_session: { kind: 'id', value: ' ' } };
    const pathValues = ['/tmp/', '.jsonl', '/tmp/.jsonl', '/tmp\\', 'a.jsonl/'];
    assert.equal(sessionOf(idData, sessionOfForKind), ' ');
    assert.equal(seenFrom(idData, sessionOfForKind)?.session, ' ');
    assert.equal(decode({ event: 'pane_agent_detected', data: idData }, sessionOfForKind).kind, 'detected');
    for (const value of pathValues) {
        const pathData = { pane_id: 'p', tab_id: 't', workspace_id: 'w', agent: 'claude', agent_session: { kind: 'path', value } };
        assert.equal(sessionOf(pathData, sessionOfForKind), '');
        assert.equal(paneSessionOf(pathData, sessionOfForKind)?.session, '');
        assert.equal(seenFrom(pathData, sessionOfForKind)?.session, '');
        assert.equal(decode({ event: 'pane_agent_detected', data: pathData }, sessionOfForKind).kind, 'detected');
    }
    const firstEmpty = { ...idData, agent_session: { kind: 'path', value: '/tmp/' }, pane: { agent_session: { kind: 'id', value: 'later' } } };
    assert.equal(sessionOf(firstEmpty, sessionOfForKind), '');
});
