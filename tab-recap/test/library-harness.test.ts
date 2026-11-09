import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CapabilityName, Engine, TOOLS_OFF } from '@stateforge-labs/harness-adapters/runtime';
import type { RunFailure } from '@stateforge-labs/harness-adapters/runtime';
import { fakeOutput, fakeRuntime } from '@stateforge-labs/harness-adapters/testing';
import type { FakeCall, FakeRuntime } from '@stateforge-labs/harness-adapters/testing';
import type { Entry } from '#src/ports/transcripts.ts';
import { loadConfig } from '#src/daemon/config.ts';
import type { Config } from '#src/daemon/config.ts';
import { MAKERS } from '#src/daemon/harness-makers.ts';
import { CLAUDE_POLICY_ACK_DEFAULT } from '#src/recap/domain/claude-policy-ack.ts';
import { LibraryHarness } from '#src/adapters/harness/library.ts';
import { RecapWriter } from '#src/adapters/job/writer.ts';
import { isUnknown } from '#src/ports/unknowable.ts';
import { requestOf } from '#test/support.ts';

const call = { instructions: 'do', input: 'in' };
const settings = { model: '', effort: 'low' } as const;

function scripted(id: 'claude' | 'codex' | 'opencode', ...items: Parameters<typeof fakeOutput>[0][]): FakeRuntime {
    return fakeRuntime({ scripts: { [id]: items.map((item) => fakeOutput(item)) } });
}

function firstCall(runtime: FakeRuntime): FakeCall {
    const [first] = runtime.calls;
    assert.ok(first !== undefined);
    return first;
}

function transformOf(made: FakeCall): (source: Record<string, string>) => Readonly<Record<string, string | undefined>> {
    const env = made.options.env;
    assert.ok(env?.kind === 'inherit' && env.transform !== undefined);
    return env.transform;
}

const ENTRIES: readonly Entry[] = Array.from({ length: 400 }, (_, n) => ({ role: n % 2 === 0 ? 'user' : 'agent', text: `turn ${n} ${'word '.repeat(60)}` }));

const failing = (failure: RunFailure, id: 'claude' | 'codex' | 'opencode' = 'codex'): FakeRuntime => fakeRuntime({ scripts: { [id]: [failure] } });

test('claude: login-store with the acknowledgement, tools off, a private deleted cwd, no persistence', async () => {
    const runtime = scripted('claude', { text: 'answer', cost: { usd: 0.02, basis: 'list' } });
    const ran = await new LibraryHarness(runtime, 'claude', 1234, undefined, true).run(call, settings);
    assert.deepEqual(ran, { kind: 'ran', text: 'answer', costUsd: 0.02, costBasis: 'list' });
    assert.equal(runtime.calls.length, 1);
    const { id, options } = firstCall(runtime);
    assert.equal(id, 'claude');
    assert.deepEqual(options.credential, { mode: 'login-store', acknowledgePolicy: true });
    assert.equal(options.tools, TOOLS_OFF);
    assert.deepEqual(options.cwd, { private: 'delete' });
    assert.equal(options.persist, false);
    assert.equal(options.timeoutMs, 1234);
    assert.equal(options.env?.kind, 'inherit');
});

test('claude: the request carries the instructions, the input, haiku as the default model and the effort', async () => {
    const runtime = scripted('claude', { text: 'answer' });
    await new LibraryHarness(runtime, 'claude', 1000, undefined, true).run(call, settings);
    const { request } = firstCall(runtime);
    assert.deepEqual(request, { instructions: 'do', input: 'in', effort: 'low', model: 'haiku' });
});

test('claude without the acknowledgement: Unknown failed naming the key, and no run call is made', async () => {
    const runtime = scripted('claude', { text: 'never' });
    const ran = await new LibraryHarness(runtime, 'claude', 1000).run(call, settings);
    assert.ok(isUnknown(ran) && ran.why.why === 'failed' && ran.why.detail.includes('TAB_RECAP_CLAUDE_POLICY_ACK'));
    assert.equal(runtime.calls.length, 0);
});

test('codex: no persistence, no cost basis, a cost of zero, the harness default model, no acknowledgement needed', async () => {
    const runtime = scripted('codex', { text: 'answer', cost: { usd: null, basis: 'unavailable' } });
    const ran = await new LibraryHarness(runtime, 'codex', 1000).run(call, { model: '', effort: 'default' });
    assert.deepEqual(ran, { kind: 'ran', text: 'answer', costUsd: 0, costBasis: 'unavailable' });
    const { options, request } = firstCall(runtime);
    assert.deepEqual(options.credential, { mode: 'login-store' });
    assert.equal(options.persist, false);
    assert.deepEqual(request, { instructions: 'do', input: 'in', effort: 'harness-default' });
});

test('opencode: persists because its ephemeral cell is unmeasured, always the harness default effort, the job tag in the environment', async () => {
    const runtime = scripted('opencode', { text: 'answer' });
    const harness = new LibraryHarness(runtime, 'opencode', 1000, 'judge');
    await harness.run(call, { model: 'opencode/big-pickle', effort: 'high' });
    const first = firstCall(runtime);
    assert.equal(first.options.persist, true);
    assert.equal(first.request.effort, 'harness-default');
    assert.equal(first.request.model, 'opencode/big-pickle');
    assert.equal(transformOf(first)({})['OTEL_RESOURCE_ATTRIBUTES'], 'tab_recap.job=judge');
});

test('opencode persists only while the ephemeral cell is unusable: a supported cell turns persistence off', async () => {
    const base = fakeRuntime({ scripts: {} }).capabilities('opencode');
    assert.ok(base !== null);
    assert.equal(base[CapabilityName.Ephemeral][Engine.Cli].state, 'unmeasured');
    const flipped = { ...base, [CapabilityName.Ephemeral]: { ...base[CapabilityName.Ephemeral], [Engine.Cli]: { state: 'supported' } } } as typeof base;
    const runtime = fakeRuntime({ scripts: { opencode: [fakeOutput({ text: 'answer' })] }, capabilities: { opencode: flipped } });
    await new LibraryHarness(runtime, 'opencode', 1000).run(call, settings);
    assert.equal(firstCall(runtime).options.persist, false);
});

test('the environment transform: no HERDR_ or TAB_RECAP_ names, no nested-agent names, everything else kept', async () => {
    const runtime = scripted('claude', { text: 'answer' });
    await new LibraryHarness(runtime, 'claude', 1000, 'recap-writer', true).run(call, settings);
    const seen = transformOf(firstCall(runtime))({ HERDR_PANE: 'p', TAB_RECAP_STATE: 's', CLAUDECODE: '1', CLAUDE_CODE_ENTRYPOINT: 'cli', PATH: '/bin', OTEL_RESOURCE_ATTRIBUTES: 'a=b' });
    assert.deepEqual(Object.keys(seen).toSorted(), ['OTEL_RESOURCE_ATTRIBUTES', 'PATH']);
    assert.equal(seen['OTEL_RESOURCE_ATTRIBUTES'], 'a=b,tab_recap.job=recap-writer');
});

test('a timeout is Unknown timeout with the run\'s own time', async () => {
    const ran = await new LibraryHarness(failing({ kind: 'timeout', message: 'slow', timeoutMs: 4321 }), 'codex', 1000).run(call, settings);
    assert.ok(isUnknown(ran) && ran.why.why === 'timeout' && ran.why.after === 4321);
});

test('every other failure is Unknown failed with its kind and message, at most 300 characters; an exit keeps its code', async () => {
    const exited = await new LibraryHarness(failing({ kind: 'exit', message: 'x'.repeat(500), code: 7, signal: null, stderrTail: '' }), 'codex', 1000).run(call, settings);
    assert.ok(isUnknown(exited) && exited.why.why === 'failed' && exited.why.code === 7 && exited.why.detail.length === 300 && exited.why.detail.startsWith('exit: '));
    const refused = await new LibraryHarness(failing({ kind: 'unparsable', message: 'bad', reason: 'r' }), 'codex', 1000).run(call, settings);
    assert.ok(isUnknown(refused) && refused.why.why === 'failed' && refused.why.code === 1 && refused.why.detail === 'unparsable: bad');
});

test('a too-large failure is Unknown failed, and the harness limit is the library\'s prompt limit', async () => {
    const runtime = fakeRuntime({ scripts: { claude: [{ kind: 'too-large', message: 'big', limitBytes: 100, actualBytes: 200, field: 'instructions' }] }, promptLimits: { claude: 100, codex: null } });
    const harness = new LibraryHarness(runtime, 'claude', 1000, undefined, true);
    assert.equal(harness.limit, 100);
    assert.equal(new LibraryHarness(runtime, 'codex', 1000).limit, null);
    const ran = await harness.run(call, settings);
    assert.ok(isUnknown(ran) && ran.why.why === 'failed' && ran.why.detail.startsWith('too-large'));
});

test('the writer fits its call to the claude prompt limit and sends the whole transcript when there is none', async () => {
    const request = requestOf({ entries: ENTRIES });
    const sentWith = async (limit: number | null): Promise<number> => {
        const runtime = fakeRuntime({ scripts: { claude: [fakeOutput({ text: '{"ops":[]}' })] }, promptLimits: { claude: limit } });
        await new RecapWriter(new LibraryHarness(runtime, 'claude', 1000, undefined, true), { model: '', effort: 'default' }).write(request);
        return Buffer.byteLength(firstCall(runtime).request.input);
    };
    const [fitted, whole] = [await sentWith(30_000), await sentWith(null)];
    assert.ok(fitted < whole, `${fitted} < ${whole}`);
});

test('labels: the default model shows, an empty model of codex and opencode shows only the harness', () => {
    const runtime = fakeRuntime({ scripts: {} });
    assert.equal(new LibraryHarness(runtime, 'claude', 1).label({ model: '', effort: 'low' }), 'claude/haiku');
    assert.equal(new LibraryHarness(runtime, 'codex', 1).label({ model: 'gpt-6-luna', effort: 'high' }), 'codex/gpt-6-luna');
    assert.equal(new LibraryHarness(runtime, 'opencode', 1).label(settings), 'opencode');
});

test('guard: no run class, argument builder, session cleanup or --pure under adapters/harness', () => {
    const dir = new URL('../src/adapters/harness/', import.meta.url);
    const files = readdirSync(dir).filter((name) => name.endsWith('.ts'));
    assert.ok(files.includes('library.ts'));
    for (const name of files) {
        const text = readFileSync(join(dir.pathname, name), 'utf8');
        for (const banned of ['claudeHeadlessArgs', 'codexExec', 'opencodeSessionDeleteArgs', 'opencodeSessionListArgs', '--pure']) {
            assert.ok(!text.includes(banned), `${name} names ${banned}`);
        }
    }
});

function withAck(value: string | undefined, body: () => void): void {
    const saved = { ack: process.env['TAB_RECAP_CLAUDE_POLICY_ACK'], dir: process.env['HERDR_PLUGIN_CONFIG_DIR'] };
    process.env['HERDR_PLUGIN_CONFIG_DIR'] = join(tmpdir(), 'library-harness-no-config');
    if (value === undefined) { delete process.env['TAB_RECAP_CLAUDE_POLICY_ACK']; } else { process.env['TAB_RECAP_CLAUDE_POLICY_ACK'] = value; }
    try {
        body();
    } finally {
        if (saved.ack === undefined) { delete process.env['TAB_RECAP_CLAUDE_POLICY_ACK']; } else { process.env['TAB_RECAP_CLAUDE_POLICY_ACK'] = saved.ack; }
        if (saved.dir === undefined) { delete process.env['HERDR_PLUGIN_CONFIG_DIR']; } else { process.env['HERDR_PLUGIN_CONFIG_DIR'] = saved.dir; }
    }
}

test('TAB_RECAP_CLAUDE_POLICY_ACK: off by default, on and off by name, anything else is the default', () => {
    withAck(undefined, () => { assert.equal(loadConfig().claudePolicyAck, CLAUDE_POLICY_ACK_DEFAULT); assert.equal(CLAUDE_POLICY_ACK_DEFAULT, 'off'); });
    withAck('on', () => { assert.equal(loadConfig().claudePolicyAck, 'on'); });
    withAck(' ON ', () => { assert.equal(loadConfig().claudePolicyAck, 'on'); });
    withAck('off', () => { assert.equal(loadConfig().claudePolicyAck, 'off'); });
    withAck('yes', () => { assert.equal(loadConfig().claudePolicyAck, CLAUDE_POLICY_ACK_DEFAULT); });
});

test('the claude maker passes the configured acknowledgement: off makes no run call, on makes one', async () => {
    const config = { timeoutMs: 1000 } as Config;
    const refused = scripted('claude', { text: 'x' });
    const off = await MAKERS.claude({ ...config, claudePolicyAck: 'off' }, '/work', refused).run(call, settings);
    assert.ok(isUnknown(off));
    assert.equal(refused.calls.length, 0);
    const allowed = scripted('claude', { text: 'x' });
    const on = await MAKERS.claude({ ...config, claudePolicyAck: 'on' }, '/work', allowed).run(call, settings);
    assert.equal(on.kind, 'ran');
    assert.equal(allowed.calls.length, 1);
});
