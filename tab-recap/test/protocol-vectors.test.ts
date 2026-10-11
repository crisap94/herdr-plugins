import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXCHANGES } from '../src/protocol/exchanges/index.ts';
import type { Exchange } from '../src/protocol/exchange.ts';
import { answerToken, answerValue, badIdValue, parseRequest, serializeRequest } from '../src/protocol/exchange.ts';
import { buildRegistry } from '../src/protocol/registry.ts';
import type { Registry } from '../src/protocol/registry.ts';
import { observe } from '../src/protocol/requester.ts';
import { answer, take } from '../src/protocol/responder.ts';
import type { SeenCheck } from '../src/protocol/responder.ts';
import type { ParsedValue } from '../src/protocol/codec.ts';
import type { Refusal, RequestId, TokenValue } from '../src/protocol/primitives.ts';
import type { Result } from '../src/protocol/result.ts';
import { must } from '../src/protocol/result.ts';

type Refused = { readonly kind: 'refused'; readonly reason: string; readonly subject: string };

type TakeExpect = { readonly taken: readonly unknown[]; readonly refused: readonly unknown[] };

type Step =
    | { readonly write: { readonly name: string; readonly value: string | null } }
    | { readonly answer: { readonly id: string; readonly stage: string } }
    | { readonly take: TakeExpect }
    | { readonly observe: { readonly id: string; readonly expect: unknown } };

type Trace = { readonly name: string; readonly steps: readonly Step[] };

type Vector = {
    readonly exchange: string;
    readonly exchangeVersion: number;
    readonly requestPrefix: string;
    readonly answerToken: string;
    readonly timing: Readonly<Record<string, number>>;
    readonly requests: readonly { readonly raw: string; readonly expect: unknown }[];
    readonly serializes: readonly { readonly value: ParsedValue; readonly expect: unknown }[];
    readonly answers: readonly { readonly id: string; readonly stage: string; readonly expect: unknown }[];
    readonly badIds: readonly { readonly rawId: string; readonly expect: string }[];
    readonly traces: readonly Trace[];
};

type Replay = { readonly tokens: Record<string, string>; readonly remembered: Set<string> };

const VECTORS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'protocol', 'vectors');

const REGISTRY: Registry = must(buildRegistry(EXCHANGES, []));

const loadVector = (exchange: Exchange): Vector =>
    JSON.parse(readFileSync(join(VECTORS_DIR, `${exchange.name}.json`), 'utf8')) as Vector;

const refusedOf = (error: Refusal): Refused => ({ kind: 'refused', reason: error.reason, subject: error.subject });

const parsedOf = (result: Result<ParsedValue, Refusal>): unknown =>
    result.kind === 'ok' ? { kind: 'parsed', id: result.value.id, note: result.value.note ?? null } : refusedOf(result.error);

const valueOf = (result: Result<TokenValue, Refusal>): unknown =>
    result.kind === 'ok' ? { kind: 'value', value: result.value } : refusedOf(result.error);

const keyOf = (name: string, tool: string, id: string): string => `${name}|${tool}|${id}`;

const writeToken = (tokens: Record<string, string>, name: string, value: string | null): void => {
    if (value === null) {
        delete tokens[name];
    } else {
        tokens[name] = value;
    }
};

const takeStep = (replay: Replay, trace: Trace, expect: TakeExpect): void => {
    const seen: SeenCheck = (name, tool, id) => replay.remembered.has(keyOf(name, tool, id));
    const taking = take(REGISTRY, replay.tokens, seen);
    const observed = {
        taken: taking.taken.map((item) => ({ tool: item.tool, id: item.id, note: item.value.note ?? null })),
        refused: taking.refused.map((item) => ({ tool: item.tool, rawId: item.rawId, answer: item.answer })),
    };
    assert.deepEqual(observed, expect, trace.name);
    for (const item of taking.taken) {
        replay.remembered.add(keyOf(item.exchange.name, item.tool, item.id));
    }
};

const observeStep = (exchange: Exchange, replay: Replay, trace: Trace, step: { readonly id: string; readonly expect: unknown }): void => {
    const observed = observe(exchange, replay.tokens, step.id as RequestId);
    assert.deepEqual(observed.kind === 'ok' ? observed.value : refusedOf(observed.error), step.expect, trace.name);
};

const runStep = (exchange: Exchange, replay: Replay, trace: Trace, step: Step): void => {
    if ('write' in step) {
        writeToken(replay.tokens, step.write.name, step.write.value);
    } else if ('answer' in step) {
        const written = must(answer(exchange, step.answer.id as RequestId, step.answer.stage));
        writeToken(replay.tokens, written.name, written.value);
    } else if ('take' in step) {
        takeStep(replay, trace, step.take);
    } else {
        observeStep(exchange, replay, trace, step.observe);
    }
};

const runTrace = (exchange: Exchange, trace: Trace): void => {
    const replay: Replay = { tokens: {}, remembered: new Set<string>() };
    for (const step of trace.steps) {
        runStep(exchange, replay, trace, step);
    }
};

for (const exchange of EXCHANGES) {
    const vector = loadVector(exchange);

    test(`${exchange.name}: the vector header matches its descriptor`, () => {
        assert.equal(vector.exchange, exchange.name);
        assert.equal(vector.exchangeVersion, exchange.version);
        assert.equal(vector.requestPrefix, exchange.requestPrefix);
        assert.equal(vector.answerToken, must(answerToken(exchange)));
        assert.deepEqual(vector.timing, exchange.timing);
    });

    test(`${exchange.name}: request values parse as published`, () => {
        for (const item of vector.requests) {
            assert.deepEqual(parsedOf(parseRequest(exchange, item.raw)), item.expect, JSON.stringify(item.raw));
        }
    });

    test(`${exchange.name}: parsed values serialize as published`, () => {
        for (const item of vector.serializes) {
            assert.deepEqual(valueOf(serializeRequest(exchange, item.value)), item.expect, JSON.stringify(item));
        }
    });

    test(`${exchange.name}: answers are id and stage, cut and refused as published`, () => {
        for (const item of vector.answers) {
            assert.deepEqual(valueOf(answerValue(exchange, item.id as RequestId, item.stage)), item.expect, JSON.stringify(item));
        }
    });

    test(`${exchange.name}: bad ids are answered as published`, () => {
        for (const item of vector.badIds) {
            assert.equal(badIdValue(item.rawId), item.expect, JSON.stringify(item.rawId));
        }
    });

    test(`${exchange.name}: traces observe the published states`, () => {
        for (const trace of vector.traces) {
            runTrace(exchange, trace);
        }
    });
}
