import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HarnessDecider } from '#src/adapters/harness-decider.ts';
import type { Noul } from '#src/ports/decider.ts';
import type { Harness, HarnessCall, Ran } from '#src/ports/harness.ts';
import { unknown } from '#src/ports/unknowable.ts';

const questions: Record<string, Noul> = {
    closes_request: { instructions: 'Does last_reply deliver what last_prompt asked for?', criteria: { true: 'it reports done', false: 'it is an intermediate step' } },
    stuck: { instructions: { question: 'same step failing?' }, criteria: { true: 'retries', false: 'progress' } },
};

function decider(reply: Ran | string, limit: number | null = null): { decider: HarnessDecider; calls: HarnessCall[] } {
    const calls: HarnessCall[] = [];
    const harness: Harness = {
        id: 'fake', limit, label: (settings) => `fake/${settings.model || 'default'}`,
        run: (call): Promise<Ran> => { calls.push(call); return Promise.resolve(typeof reply === 'string' ? { kind: 'ran', text: reply, costUsd: 0.0004 } : reply); },
    };
    let tick = 0;
    return { decider: new HarnessDecider(harness, { model: 'haiku', effort: 'low' }, () => (tick += 2200)), calls };
}

test('harness decider: one call, the state as JSON input, every question listed; the probabilities come back with the harness cost', async () => {
    const { decider: ask, calls } = decider('{"closes_request": 0.92, "stuck": 0.03}');
    const found = await ask.ask({ goal: 'merge' }, questions);
    assert.equal(found.kind, 'decided');
    assert.deepEqual([found.answers, found.costUsd, found.tookMs, found.model, ask.label], [{ closes_request: 0.92, stuck: 0.03 }, 0.0004, 2200, 'fake/haiku', 'fake · haiku · low']);
    assert.ok(found.tokens > 0);
    const [call] = calls as [HarnessCall];
    assert.equal(calls.length, 1);
    assert.equal(call.input, '{"goal":"merge"}');
    assert.match(call.instructions, /- closes_request: Does last_reply[^\n]*\n {2}true when: it reports done\n {2}false when: it is an intermediate step\n- stuck: \{"question":"same step failing\?"\}/);
});

test('harness decider: fenced JSON is read, extra keys are ignored', async () => {
    const found = await decider('```json\n{"closes_request": 1, "stuck": 0, "other": 7}\n```').decider.ask({}, questions);
    assert.deepEqual(found.kind === 'decided' ? found.answers : null, { closes_request: 1, stuck: 0 });
});

for (const [name, reply] of [['a missing id', '{"closes_request": 0.9}'], ['out of range', '{"closes_request": 1.2, "stuck": 0}'], ['a negative', '{"closes_request": -0.1, "stuck": 0}'], ['a string', '{"closes_request": "0.9", "stuck": 0}'], ['prose', 'I think the first is likely.'], ['an array', '[0.9, 0.1]'], ['null', 'null']] as const) {
    test(`harness decider: ${name} is unreadable`, async () => {
        const found = await decider(reply).decider.ask({}, questions);
        assert.deepEqual(found.kind === 'unknown' ? found.why.why : found.kind, 'unreadable');
    });
}

test('harness decider: a harness that fails passes its Unknown on; a state too long for it is never sent', async () => {
    const failing = unknown({ why: 'timeout', after: 5 as never });
    assert.deepEqual(await decider(failing).decider.ask({}, questions), failing);
    const { decider: small, calls } = decider('{}', 10);
    assert.equal((await small.ask({ a: 'x'.repeat(100) }, questions)).kind, 'unknown');
    assert.equal(calls.length, 0);
});
