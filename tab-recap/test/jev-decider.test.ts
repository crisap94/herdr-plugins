import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JevPortDecider } from '#src/adapters/job/jev-decider.ts';
import { jevKey } from '#src/adapters/job/jev-key.ts';
import type { Question } from '@stateforge-labs/session-ledger';
import type { EnvironmentName } from '@stateforge-labs/session-ledger';
import { parseJevModel, parseJevUrl } from '@stateforge-labs/session-ledger';
import type { FsPath } from '#src/recap/domain/fs-path.ts';
import { instant, type Instant, duration } from '@stateforge-labs/session-ledger';
import { saying } from '@stateforge-labs/session-ledger';
import type { Text } from '@stateforge-labs/session-ledger';
import { documentOf, noulOf, textOf } from './fakes/decider-fixtures.ts';

const SENTINEL = 'SENTINEL-KEY-123';
const questions: ReadonlyMap<Text, Question> = new Map<Text, Question>([
    [textOf('closes_request'), noulOf('Does last_reply deliver what last_prompt asked for?', 'it reports done', 'it is an intermediate step')],
    [textOf('stuck'), noulOf('same step failing?', 'retry', 'progress')],
]);
const reply = (body: object, status = 200): Response => new Response(JSON.stringify(body), { status });
const good = { model: 'jev-1.13.0', answers: { closes_request: { noul: 0.95 }, stuck: { noul: 0.04 } }, usage: { input_tokens: 732 } };

function decider(respond: (url: string, init: RequestInit) => Promise<Response>, key: string | null = SENTINEL): { jev: JevPortDecider; seen: { url: string; init: RequestInit }[] } {
    const seen: { url: string; init: RequestInit }[] = [];
    const fetcher = ((url: string, init: RequestInit): Promise<Response> => { seen.push({ url, init }); return respond(url, init); }) as unknown as typeof fetch;
    let tick = 0;
    return { jev: new JevPortDecider({ url: parseJevUrl('https://gateway.test/v1/systemone'), model: parseJevModel('jev-1.13.0'), key: () => (key === null ? null : textOf(key)), fetch: fetcher, now: () => instant((tick += 550)) }), seen };
}

test('jev: posts {model, state, questions} with the bearer key; the answers, tokens, cost (input × 0.042 / 1e6) and time come back', async () => {
    const { jev, seen } = decider(() => Promise.resolve(reply(good)));
    const found = await jev.ask(documentOf({ goal: 'x' }), questions);
    assert.deepEqual(found.kind === 'decided' ? { ...found, answers: Object.fromEntries(found.answers) } : found, { kind: 'decided', answers: { closes_request: 0.95, stuck: 0.04 }, tokens: 732, costUsd: 732 * 0.042 / 1e6, tookMs: duration(550), model: 'jev-1.13.0' });
    assert.equal(jev.label, 'jev · jev-1.13.0');
    const [call] = seen as [{ url: string; init: { headers: Record<string, string>; body: string } }];
    assert.equal(call.url, 'https://gateway.test/v1/systemone');
    assert.equal(call.init.headers['authorization'], `Bearer ${SENTINEL}`);
    const sent = JSON.parse(call.init.body) as { model: string; state: object; questions: Record<string, { type: string; instructions: unknown; criteria: unknown }> };
    assert.deepEqual([sent.model, sent.state, sent.questions['closes_request']?.type, sent.questions['stuck']?.instructions, Object.keys(sent.questions)], ['jev-1.13.0', { goal: 'x' }, 'noul', 'same step failing?', ['closes_request', 'stuck']]);
});

const paths: readonly [string, () => Promise<Response>, RegExp][] = [
    ['401', () => Promise.resolve(reply({ error: SENTINEL }, 401)), /code 401|exited 401/],
    ['403', () => Promise.resolve(reply({}, 403)), /refused/],
    ['429', () => Promise.resolve(reply({}, 429)), /busy/],
    ['529', () => Promise.resolve(reply({}, 529)), /busy/],
    ['500', () => Promise.resolve(reply({}, 500)), /HTTP 500/],
    ['timeout', () => Promise.reject(new DOMException(`aborted ${SENTINEL}`, 'TimeoutError')), /timed out/],
    ['network', () => Promise.reject(new TypeError(`fetch failed for ${SENTINEL}`)), /did not answer/],
    ['not JSON', () => Promise.resolve(new Response(`<html>${SENTINEL}</html>`, { status: 200 })), /not JSON/],
    ['a missing answer', () => Promise.resolve(reply({ answers: { closes_request: { noul: 0.9 } } })), /no usable answer for stuck/],
    ['an answer out of range', () => Promise.resolve(reply({ answers: { closes_request: { noul: 1.5 }, stuck: { noul: 0 } } })), /no usable answer for closes_request/],
    ['an answer that is not a number', () => Promise.resolve(reply({ answers: { closes_request: { noul: 'high' }, stuck: { noul: 0 } } })), /no usable answer/],
];

for (const [name, respond, say] of paths) {
    test(`jev: ${name} is unknown, and the key is in no part of what is said`, async () => {
        const found = await decider(respond).jev.ask(documentOf({}), questions);
        assert.equal(found.kind, 'unknown');
        assert.match(saying(found.why), say);
        assert.ok(!JSON.stringify(found).includes(SENTINEL), JSON.stringify(found));
    });
}

test('jev: no key means no call; the key is read at call time', async () => {
    const { jev, seen } = decider(() => Promise.resolve(reply(good)), null);
    const found = await jev.ask(documentOf({}), questions);
    assert.deepEqual([found.kind, seen.length], ['unknown', 0]);
    assert.ok(!JSON.stringify(found).includes(SENTINEL));
});

test('jev: a missing usage costs nothing', async () => {
    const found = await decider(() => Promise.resolve(reply({ answers: good.answers }))).jev.ask(documentOf({}), questions);
    assert.deepEqual(found.kind === 'decided' ? [found.tokens, found.costUsd, found.model] : null, [0, 0, 'jev-1.13.0']);
});

const settings = (values: Readonly<Record<string, string>>): ((name: EnvironmentName) => Text | undefined) => (name) => {
    const value = values[name];
    return value === undefined ? undefined : textOf(value);
};
const fileOf = (content: string | null, seen: string[] = []): ((path: FsPath) => Text | null) => (path) => { seen.push(path); return content === null ? null : textOf(content); };

test('the key: TAB_RECAP_JEV_KEY, then TYPESAFE_API_KEY, then the file in the home folder; blank counts as missing', () => {
    const home = textOf('/h');
    assert.equal(jevKey(settings({ TAB_RECAP_JEV_KEY: ' a ', TYPESAFE_API_KEY: 'b' }), fileOf('c'), home), 'a');
    assert.equal(jevKey(settings({ TAB_RECAP_JEV_KEY: '  ', TYPESAFE_API_KEY: 'b' }), fileOf('c'), home), 'b');
    const files: string[] = [];
    assert.equal(jevKey(settings({}), fileOf('c\nignored\n', files), home), 'c');
    assert.deepEqual(files, ['/h/.config/typesafe-api-key']);
    assert.equal(jevKey(settings({}), fileOf(null), home), null);
    assert.equal(jevKey(settings({}), fileOf('\n'), home), null);
    assert.equal(jevKey(settings({}), fileOf('k'), textOf('')), 'k', 'a blank HOME still reads /.config/typesafe-api-key');
});

test('jev: a fractional token count is kept and priced, and a clock that steps back gives a negative time', async () => {
    const fetcher = ((): Promise<Response> => Promise.resolve(reply({ ...good, usage: { input_tokens: 12.5 } }))) as unknown as typeof fetch;
    const clock = [5_000, 4_000];
    const jev = new JevPortDecider({ url: parseJevUrl('https://gateway.test/v1/systemone'), model: parseJevModel('jev-1.13.0'), key: (): Text => textOf(SENTINEL), fetch: fetcher, now: (): Instant => instant(clock.shift() ?? 0) });
    const found = await jev.ask(documentOf({}), questions);
    assert.deepEqual(found.kind === 'decided' ? [found.tokens, found.costUsd, found.tookMs] : found, [12.5, 12.5 * 0.042 / 1e6, -1_000]);
});
