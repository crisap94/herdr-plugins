import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HerdrAgents } from '#src/adapters/herdr-agents.ts';
import type { Wire } from '#src/adapters/herdr-agents.ts';

function agents(fail: string | null = null): { agents: HerdrAgents; calls: { method: string; params: unknown }[] } {
    const calls: { method: string; params: unknown }[] = [];
    const wire: Wire = (method, params) => {
        calls.push({ method, params });
        return method === fail ? Promise.reject(new Error('refused')) : Promise.resolve({});
    };
    return { agents: new HerdrAgents(wire, { id: 'tab-recap', stateDir: '/s' }), calls };
}

test('typeLine types the text, then presses Enter — in that order, never as a prompt', async () => {
    const { agents: fake, calls } = agents();
    assert.deepEqual(await fake.typeLine('w1:p1', '/compact (1) keep this'), { kind: 'sent' });
    assert.deepEqual(calls, [
        { method: 'pane.send_text', params: { pane_id: 'w1:p1', text: '/compact (1) keep this' } },
        { method: 'pane.send_keys', params: { pane_id: 'w1:p1', keys: ['enter'] } },
    ]);
});

test('typeLine refuses a line with a line break and sends nothing; a failed call is Unknown, and Enter is not pressed after a failed type', async () => {
    const refused = agents();
    assert.equal((await refused.agents.typeLine('w1:p1', 'a\nb')).kind, 'unknown');
    assert.deepEqual(refused.calls, []);
    const failed = agents('pane.send_text');
    assert.equal((await failed.agents.typeLine('w1:p1', 'a')).kind, 'unknown');
    assert.equal(failed.calls.length, 1);
});

test('prompt keeps agent.prompt for codex and opencode: target, text, and the wait', async () => {
    const { agents: fake, calls } = agents();
    await fake.prompt('w1:p2', '/compact', { until: ['idle', 'done'], timeoutMs: 600_000 });
    assert.deepEqual(calls, [{ method: 'agent.prompt', params: { target: 'w1:p2', text: '/compact', wait: { until: ['idle', 'done'], timeout_ms: 600_000 } } }]);
});
