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

test('typeLine types each piece, then presses Enter — in that order, never as a prompt', async () => {
    const { agents: fake, calls } = agents();
    assert.deepEqual(await fake.typeLine('w1:p1', ['/compact ', '(1) keep this']), { kind: 'sent' });
    assert.deepEqual(calls, [
        { method: 'pane.send_text', params: { pane_id: 'w1:p1', text: '/compact ' } },
        { method: 'pane.send_text', params: { pane_id: 'w1:p1', text: '(1) keep this' } },
        { method: 'pane.send_keys', params: { pane_id: 'w1:p1', keys: ['enter'] } },
    ]);
});

test('typeLine refuses a line with a line break and sends nothing; a failed call is Unknown, and Enter is not pressed after a failed type', async () => {
    const refused = agents();
    assert.equal((await refused.agents.typeLine('w1:p1', ['/compact ', 'a\nb'])).kind, 'unknown');
    assert.deepEqual(refused.calls, []);
    const failed = agents('pane.send_text');
    assert.equal((await failed.agents.typeLine('w1:p1', ['/compact ', 'a'])).kind, 'unknown');
    assert.equal(failed.calls.length, 1);
});

test('prompt keeps agent.prompt for codex and opencode: target, text, and the wait', async () => {
    const { agents: fake, calls } = agents();
    await fake.prompt('w1:p2', '/compact', { until: ['idle', 'done'], timeoutMs: 600_000 });
    assert.deepEqual(calls, [{ method: 'agent.prompt', params: { target: 'w1:p2', text: '/compact', wait: { until: ['idle', 'done'], timeout_ms: 600_000 } } }]);
});

test('prompt counts a stalled prompt as sent: the text went in, the agent just ran it at once (codex `/compact`)', async () => {
    const calls: { method: string; params: unknown }[] = [];
    const wire: Wire = (method, params) => {
        calls.push({ method, params });
        return Promise.reject(Object.assign(new Error('agent prompt produced no observed working or blocked state within 5000 ms; current status is done'), { code: 'agent_prompt_stalled' }));
    };
    const fake = new HerdrAgents(wire, { id: 'tab-recap', stateDir: '/s' });
    assert.deepEqual(await fake.prompt('w1:p2', '/compact', { until: ['idle', 'done'], timeoutMs: 1000 }), { kind: 'sent' });
    assert.equal(calls.length, 1);
});

test('typeLine waits a moment before Enter: an agent\'s slash-command popup swallows an Enter that comes at once', async () => {
    const order: string[] = [];
    const wire: Wire = (method) => { order.push(method); return Promise.resolve({}); };
    const fake = new HerdrAgents(wire, { id: 'tab-recap', stateDir: '/s' }, (ms) => { order.push(`pause ${ms}`); return Promise.resolve(); });
    await fake.typeLine('w1:p2', ['/compact']);
    assert.deepEqual(order, ['pane.send_text', 'pause 300', 'pane.send_keys']);
});
