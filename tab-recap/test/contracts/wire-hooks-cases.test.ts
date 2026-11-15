import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { Pipeline, adapters, claudeEnums, codexEnums } from '@stateforge-labs/harness-hooks';
import type { HarnessAdapter, NeutralReply } from '@stateforge-labs/harness-hooks';
import { createHookHandler } from '@stateforge-labs/harness-hooks/endpoint';
import { HOOK_EVENTS, HOOK_LIMITS } from '#src/wire/hooks/contract.ts';
import type { HookAnswer, HookHarness, HookKind, HookSource } from '#src/wire/hooks/contract.ts';
import { STATUS_COVERS_MS, turnSignalOf } from '#src/wire/hooks/turn-signal.ts';
import type { TurnSignal } from '#src/wire/hooks/turn-signal.ts';
import { hookFixture, postHook, readHookCases, stubBoard } from './wire/fakes/fake-harness.ts';
import type { HookCase, HookCaseLane } from './wire/fakes/fake-harness.ts';
import { startFakeHookEndpoint } from './wire/fakes/fake-hook-endpoint.ts';

const CASES = readHookCases();

const HARNESSES = { claude: true, codex: true } satisfies Record<HookHarness, true>;

const SOURCES = { startup: true, resume: true, clear: true, compact: true, fork: true } satisfies Record<HookSource, true>;

const KIND_OF: ReadonlyMap<string, HookKind> = new Map<string, HookKind>([
    ['stop', 'stop'],
    ['session-start', 'session-start'],
    ['pre-compact', 'pre-compact'],
]);

const NOW = 1_000_000;

function adapterOf(name: string): HarnessAdapter {
    const adapter = adapters.get(name);
    assert.ok(adapter, `harness-hooks has an adapter for ${name}`);
    return adapter;
}

function replyOf(answer: HookAnswer): NeutralReply {
    return answer.kind === 'context' ? { context: answer.text } : {};
}

function sourceOf(raw: Readonly<Record<string, unknown>>): HookSource | null {
    const value = raw['source'];
    return Object.keys(SOURCES).find((source): source is HookSource => source === value) ?? null;
}

function signalOf(lane: HookCaseLane): TurnSignal {
    return turnSignalOf(lane, lane.statusEndedMsAgo === null ? null : NOW - lane.statusEndedMsAgo, NOW);
}

function caseOf(raw: unknown): HookCase {
    const found = CASES.find((c) => isDeepStrictEqual(c.request, raw));
    assert.ok(found, 'the payload is the request of one case');
    return found;
}

function hookRequest(path: string, init: { readonly method: string; readonly body?: string; readonly headers?: Record<string, string> }): Request {
    return new Request(`http://localhost${path}`, init);
}

test('cases-claude.ndjson has one line per row of WC 4.5, K3 three times, K4 and K5 twice, each with a distinct name and request', () => {
    const counts = new Map<string, number>();
    for (const c of CASES) counts.set(c.name.slice(0, 2), (counts.get(c.name.slice(0, 2)) ?? 0) + 1);
    assert.deepEqual([...counts], [['K1', 1], ['K2', 1], ['K3', 3], ['K4', 2], ['K5', 2], ['K6', 1], ['K7', 1], ['K8', 1]]);
    assert.equal(new Set(CASES.map((c) => c.name)).size, CASES.length);
    for (const c of CASES) assert.equal(CASES.filter((other) => isDeepStrictEqual(other.request, c.request)).length, 1, c.name);
    assert.deepEqual(CASES.filter((c) => c.name.startsWith('K4')).map((c) => c.call?.source), ['startup', 'fork']);
});

test('every case is posted by the fake harness to the fake endpoint and comes back with its exact reply', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wire-hooks-'));
    const endpoint = await startFakeHookEndpoint(join(dir, 'hooks.sock'), 'reply-from-cases');
    try {
        for (const c of CASES) {
            const answer = await postHook(join(dir, 'hooks.sock'), c.harness, c.request);
            assert.deepEqual(answer, { status: 200, body: JSON.stringify(c.reply) }, c.name);
        }
        assert.deepEqual(endpoint.requests, CASES.map((c) => ({ path: `/hook/${c.harness}`, body: c.request })));
    } finally {
        await endpoint.stop();
        rmSync(dir, { recursive: true, force: true });
    }
});

test('the Claude adapter of harness-hooks decodes every request to the event of its call, with no field missing or of the wrong type except the absent session of K1', () => {
    const claude = adapterOf('claude');
    for (const c of CASES) {
        const decoded = claude.decode(c.request);
        assert.ok(decoded.event, c.name);
        assert.equal(decoded.known, true, c.name);
        assert.deepEqual(decoded.missing, c.name.startsWith('K1') ? ['session_id'] : [], c.name);
        assert.deepEqual(decoded.wrong_type, [], c.name);
        assert.equal(decoded.event.native, c.event, c.name);
        assert.equal(decoded.event.harness, c.harness, c.name);
        if (c.call === null) {
            assert.equal(KIND_OF.has(decoded.event.kind), false, c.name);
            continue;
        }
        assert.deepEqual(
            c.call,
            {
                harness: c.harness,
                kind: KIND_OF.get(decoded.event.kind) ?? 'other',
                native: decoded.event.native,
                session: decoded.event.session,
                source: c.call.kind === 'session-start' ? sourceOf(c.request) : null,
                cwd: typeof c.request['cwd'] === 'string' ? c.request['cwd'] : null,
            },
            c.name,
        );
    }
});

test('the Claude adapter of harness-hooks encodes the answer of every case to its reply', () => {
    const claude = adapterOf('claude');
    for (const c of CASES) assert.deepEqual(claude.encode(replyOf(c.answer), c.request), c.reply, c.name);
});

test('the real hook handler of harness-hooks, with a layer that gives each case its answer, replies each case with its exact body', async () => {
    const pipeline = new Pipeline({ timeoutMs: HOOK_LIMITS.layerMs }).use((context) => replyOf(caseOf(context.raw).answer));
    const handler = createHookHandler({ adapters, pipeline, admission: { mode: 'loopback' }, maxBodyBytes: HOOK_LIMITS.bodyBytes });
    for (const c of CASES) {
        const response = await handler(
            hookRequest(`/hook/${c.harness}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(c.request) }),
        );
        assert.equal(response.status, 200, c.name);
        assert.deepEqual(JSON.parse(await response.text()), c.reply, c.name);
    }
});

test('the real hook handler answers WC 4.2: healthz ok, a foreign host 403, a body that is not JSON 415, a body over HOOK_LIMITS.bodyBytes 413', async () => {
    const pipeline = new Pipeline({ timeoutMs: HOOK_LIMITS.layerMs });
    const handler = createHookHandler({ adapters, pipeline, admission: { mode: 'loopback' }, maxBodyBytes: HOOK_LIMITS.bodyBytes });
    const healthz = await handler(hookRequest('/healthz', { method: 'GET' }));
    assert.deepEqual([healthz.status, await healthz.text()], [200, 'ok']);
    const body = JSON.stringify(CASES[0]?.request);
    const foreign = await handler(hookRequest('/hook/claude', { method: 'POST', headers: { host: 'example.com', 'content-type': 'application/json' }, body }));
    assert.equal(foreign.status, 403);
    const text = await handler(hookRequest('/hook/claude', { method: 'POST', headers: { 'content-type': 'text/plain' }, body }));
    assert.equal(text.status, 415);
    const large = await handler(
        hookRequest('/hook/claude', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pad: 'x'.repeat(HOOK_LIMITS.bodyBytes) }) }),
    );
    assert.equal(large.status, 413);
});

test('the stub board follows exactly the sessions of the followed cases and hands over their lane', () => {
    const board = stubBoard(CASES);
    for (const c of CASES) {
        const session = c.request['session_id'];
        if (typeof session !== 'string') continue;
        assert.deepEqual(board.followed(c.harness, session), c.followed ? { lane: c.lane } : null, c.name);
    }
    assert.equal(board.followed('codex', 's-working'), null);
});

test('every K3 case carries a lane, and turnSignalOf on that lane gives the effect of the case', () => {
    const stops = CASES.filter((c) => c.name.startsWith('K3'));
    assert.deepEqual(stops.map((c) => c.name), ['K3-stop-working', 'K3-stop-status-covered', 'K3-stop-status-missed']);
    for (const c of stops) {
        assert.ok(c.lane, c.name);
        const signal = signalOf(c.lane).kind;
        assert.deepEqual(c.effects, signal === 'none' ? [] : [signal], c.name);
    }
});

test('every row of turn-signal.tsv holds for turnSignalOf, including the boundary at STATUS_COVERS_MS', () => {
    const rows = hookFixture('turn-signal.tsv').split('\n').filter((line) => line.length > 0);
    assert.equal(rows[0], 'lane_status\tstatus_ended_ms_ago\tsignal');
    const body = rows.slice(1).map((line) => line.split('\t'));
    assert.ok(body.some(([, ago]) => ago === String(STATUS_COVERS_MS)));
    assert.ok(body.some(([, ago]) => ago === String(STATUS_COVERS_MS + 1)));
    for (const [status, ago, signal] of body) {
        const lane = { status: status as HookCaseLane['status'], statusEndedMsAgo: ago === '-' ? null : Number(ago) };
        assert.equal(signalOf(lane).kind, signal, `${status} ${ago}`);
    }
});

test('HookSource holds exactly the five SessionStart sources of both adapters', () => {
    assert.deepEqual(Object.keys(SOURCES).toSorted(), claudeEnums.SessionStartSource.options.toSorted());
    assert.deepEqual(Object.keys(SOURCES).toSorted(), codexEnums.SessionStartSource.options.toSorted());
});

test('HookHarness is claude and codex, and HOOK_EVENTS names for each of them events its harness-hooks adapter knows', () => {
    assert.deepEqual(Object.keys(HARNESSES), Object.keys(HOOK_EVENTS));
    for (const harness of ['claude', 'codex'] as const) {
        const known = Object.keys(adapterOf(harness).jsonSchemas());
        for (const event of HOOK_EVENTS[harness]) assert.ok(known.includes(event), `${harness} ${event}`);
    }
});
