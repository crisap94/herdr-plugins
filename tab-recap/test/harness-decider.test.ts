import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HarnessPortDecider } from '#src/adapters/job/decider.ts';
import type { DeciderPort, Question } from '#src/ports/decider.ts';
import { instant } from '#src/recap/domain/time.ts';
import type { HarnessAsk, HarnessPort, HarnessRun } from '#src/ports/harness.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import { must } from '#src/protocol/result.ts';
import { parseUsd } from '#src/recap/domain/usd.ts';
import { unknown } from '#src/ports/unknowable.ts';
import type { Text } from '#src/recap/domain/text.ts';
import { documentOf, noulOf, textOf } from './fakes/decider-fixtures.ts';

const questions: ReadonlyMap<Text, Question> = new Map<Text, Question>([
    [textOf('closes_request'), noulOf('Does last_reply deliver what last_prompt asked for?', 'it reports done', 'it is an intermediate step')],
    [textOf('stuck'), noulOf('same step failing?', 'retries', 'progress')],
]);

function decider(reply: HarnessRun | string, limit: number | null = null): { decider: DeciderPort; calls: HarnessAsk[] } {
    const calls: HarnessAsk[] = [];
    const harness: HarnessPort = {
        id: textOf('fake'), limit: limit === null ? null : must(parseCount(limit)), label: (settings) => textOf(`fake/${settings.model || 'default'}`),
        run: (call): Promise<HarnessRun> => { calls.push(call); return Promise.resolve(typeof reply === 'string' ? { kind: 'ran', text: textOf(reply), costUsd: must(parseUsd(0.0004)) } : reply); },
    };
    let tick = 0;
    return { decider: new HarnessPortDecider(harness, { model: textOf('haiku'), effort: 'low' }, () => instant((tick += 2200))), calls };
}

test('harness decider: one call, the state as JSON input, every question listed; the probabilities come back with the harness cost', async () => {
    const { decider: ask, calls } = decider('{"closes_request": 0.92, "stuck": 0.03}');
    const found = await ask.ask(documentOf({ goal: 'merge' }), questions);
    assert.equal(found.kind, 'decided');
    assert.deepEqual([Object.fromEntries(found.answers), found.costUsd, found.tookMs, found.model, ask.label], [{ closes_request: 0.92, stuck: 0.03 }, 0.0004, 2200, 'fake/haiku', 'fake · haiku · low']);
    assert.ok(found.tokens > 0);
    const [call] = calls as [HarnessAsk];
    assert.equal(calls.length, 1);
    assert.equal(call.input, '{"goal":"merge"}');
    assert.match(call.instructions, /- closes_request: Does last_reply[^\n]*\n {2}true when: it reports done\n {2}false when: it is an intermediate step\n- stuck: same step failing\?/);
});

test('harness decider: fenced JSON is read, extra keys are ignored', async () => {
    const found = await decider('```json\n{"closes_request": 1, "stuck": 0, "other": 7}\n```').decider.ask(documentOf({}), questions);
    assert.deepEqual(found.kind === 'decided' ? Object.fromEntries(found.answers) : null, { closes_request: 1, stuck: 0 });
});

for (const [name, reply] of [['a missing id', '{"closes_request": 0.9}'], ['out of range', '{"closes_request": 1.2, "stuck": 0}'], ['a negative', '{"closes_request": -0.1, "stuck": 0}'], ['a string', '{"closes_request": "0.9", "stuck": 0}'], ['prose', 'I think the first is likely.'], ['an array', '[0.9, 0.1]'], ['null', 'null'], ['true and false', '{"closes_request": true, "stuck": false}'], ['true and false after prose', 'Answer: {"closes_request": true, "stuck": false}'], ['a missing id after prose', 'Answer: {"closes_request": 0.9} done'], ['out of range after prose', 'Answer: {"closes_request": 1.2, "stuck": 0} done'], ['a string after prose', 'Answer: {"closes_request": "0.9", "stuck": 0} done'], ['an array of the object', '[{"closes_request": 0.9, "stuck": 0.1}]'], ['an array of the object with prose after it', '[{"closes_request": 0.9, "stuck": 0.1}] done'], ['broken JSON after prose', 'Answer: {"closes_request": 0.9, "stuck": } done'], ['an array of the object after prose', 'Answer: [{"closes_request": 0.9, "stuck": 0.1}]']] as const) {
    test(`harness decider: ${name} is unreadable`, async () => {
        const found = await decider(reply).decider.ask(documentOf({}), questions);
        assert.deepEqual(found.kind === 'unknown' ? found.why.why : found.kind, 'unreadable');
    });
}

for (const [name, reply] of [['prose before the object', 'Here are the probabilities: {"closes_request": 0.92, "stuck": 0.03}'], ['prose after the object', '{"closes_request": 0.92, "stuck": 0.03}\nThe first is likely; the second is not.'], ['prose on both sides of a fenced object', 'Sure.\n```json\n{"closes_request": 0.92, "stuck": 0.03}\n```\nDone.'], ['a second object after the first', '{"closes_request": 0.92, "stuck": 0.03}\n{"closes_request": 0.1, "stuck": 0.9}'], ['a brace in a string and text after', '{"closes_request": 0.92, "stuck": 0.03, "why": "the } closes it"} }']] as const) {
    test(`harness decider: ${name} is read`, async () => {
        const found = await decider(reply).decider.ask(documentOf({}), questions);
        assert.deepEqual(found.kind === 'decided' ? Object.fromEntries(found.answers) : found.kind, { closes_request: 0.92, stuck: 0.03 });
    });
}

test('harness decider: a harness that fails passes its Unknown on; a state too long for it is never sent', async () => {
    const failing = unknown({ why: 'timeout', after: 5 as never });
    assert.deepEqual(await decider(failing).decider.ask(documentOf({}), questions), failing);
    const { decider: small, calls } = decider('{}', 10);
    assert.equal((await small.ask(documentOf({ a: 'x'.repeat(100) }), questions)).kind, 'unknown');
    assert.equal(calls.length, 0);
});
