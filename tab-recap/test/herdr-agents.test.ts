import { test } from 'node:test';
import { must } from '@stateforge-labs/session-ledger';
import assert from 'node:assert/strict';
import { HerdrAgentPanes } from '#src/adapters/herdr/agents.ts';
import type { Wire } from '#src/adapters/herdr/agents.ts';
import { compactionLine, parseCompactionPiece } from '#src/recap/domain/compaction-plan.ts';
import { duration, parseMilliseconds } from '@stateforge-labs/session-ledger';
import { paneId } from '#test/support/ids.ts';
import { textOf } from '@stateforge-labs/session-ledger';

function agents(fail: string | null = null): { agents: HerdrAgentPanes; calls: { method: string; params: unknown }[] } {
    const calls: { method: string; params: unknown }[] = [];
    const wire: Wire = (method, params) => {
        calls.push({ method, params });
        return method === fail ? Promise.reject(new Error('refused')) : Promise.resolve({});
    };
    return { agents: new HerdrAgentPanes(wire, { id: textOf('tab-recap'), stateDir: textOf('/s') }), calls };
}

const stalledWire: Wire = () => Promise.reject(Object.assign(new Error('stalled'), { code: 'agent_prompt_stalled' }));

test('typeLine types each piece, then presses Enter — in that order, never as a prompt', async () => {
    const { agents: fake, calls } = agents();
    assert.deepEqual(await fake.typeLine(paneId('w1:p1'), compactionLine(must(parseCompactionPiece('/compact ')), must(parseCompactionPiece('(1) keep this'))), { enterDelay: duration(300) }), { kind: 'sent' });
    assert.deepEqual(calls, [
        { method: 'pane.send_text', params: { pane_id: 'w1:p1', text: '/compact ' } },
        { method: 'pane.send_text', params: { pane_id: 'w1:p1', text: '(1) keep this' } },
        { method: 'pane.send_keys', params: { pane_id: 'w1:p1', keys: ['enter'] } },
    ]);
});

test('typeLine refuses a line with a line break and sends nothing; a failed call is Unknown, and Enter is not pressed after a failed type', async () => {
    const refused = agents();
    assert.equal((await refused.agents.typeLine(paneId('w1:p1'), compactionLine(must(parseCompactionPiece('/compact ')), must(parseCompactionPiece('a\nb'))), { enterDelay: duration(300) })).kind, 'unknown');
    assert.deepEqual(refused.calls, []);
    const failed = agents('pane.send_text');
    assert.equal((await failed.agents.typeLine(paneId('w1:p1'), compactionLine(must(parseCompactionPiece('/compact ')), must(parseCompactionPiece('a'))), { enterDelay: duration(300) })).kind, 'unknown');
    assert.equal(failed.calls.length, 1);
});

test('prompt keeps agent.prompt for codex and opencode: target, text, and the wait', async () => {
    const { agents: fake, calls } = agents();
    await fake.prompt(paneId('w1:p2'), textOf('/compact'), { until: [textOf('idle'), textOf('done')], timeout: must(parseMilliseconds(600_000)) }, { stall: 'accepts-stall' });
    assert.deepEqual(calls, [{ method: 'agent.prompt', params: { target: 'w1:p2', text: '/compact', wait: { until: ['idle', 'done'], timeout_ms: 600_000 } } }]);
});

test('prompt counts a stalled prompt as sent: the text went in, the agent just ran it at once (codex `/compact`)', async () => {
    const calls: { method: string; params: unknown }[] = [];
    const wire: Wire = (method, params) => {
        calls.push({ method, params });
        return Promise.reject(Object.assign(new Error('agent prompt produced no observed working or blocked state within 5000 ms; current status is done'), { code: 'agent_prompt_stalled' }));
    };
    const fake = new HerdrAgentPanes(wire, { id: textOf('tab-recap'), stateDir: textOf('/s') });
    assert.deepEqual(await fake.prompt(paneId('w1:p2'), textOf('/compact'), { until: [textOf('idle'), textOf('done')], timeout: must(parseMilliseconds(1000)) }, { stall: 'accepts-stall' }), { kind: 'sent' });
    assert.equal(calls.length, 1);
});

test('prompt does not count a stalled prompt as sent when the plan rejects stalls', async () => {
    const fake = new HerdrAgentPanes(stalledWire, { id: textOf('tab-recap'), stateDir: textOf('/s') });
    assert.equal((await fake.prompt(paneId('w1:p2'), textOf('restore'), undefined, { stall: 'refuses-stall' })).kind, 'unknown');
});

test('typeLine waits a moment before Enter: an agent\'s slash-command popup swallows an Enter that comes at once', async () => {
    const order: string[] = [];
    const wire: Wire = (method) => { order.push(method); return Promise.resolve({}); };
    const fake = new HerdrAgentPanes(wire, { id: textOf('tab-recap'), stateDir: textOf('/s') }, (wait) => { order.push(`pause ${wait}`); return Promise.resolve(); });
    await fake.typeLine(paneId('w1:p2'), compactionLine(must(parseCompactionPiece('/compact'))), { enterDelay: duration(300) });
    assert.deepEqual(order, ['pane.send_text', 'pause 300', 'pane.send_keys']);
});
