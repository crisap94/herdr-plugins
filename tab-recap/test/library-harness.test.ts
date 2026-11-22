import { textOf } from '#src/recap/domain/text.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CapabilityName, Engine, TOOLS_OFF } from '@stateforge-labs/harness-adapters/runtime';
import type { RunFailure } from '@stateforge-labs/harness-adapters/runtime';
import { fakeOutput, fakeRuntime } from '#test/fakes/harness-runtime.ts';
import type { FakeCall } from '@stateforge-labs/harness-adapters/testing';
import type { PolicedRuntime } from '#test/fakes/harness-runtime.ts';
import type { Entry } from '#src/ports/transcripts.ts';
import type { Harness, HarnessCall, Ran, StructuredSupport } from '#src/ports/harness.ts';
import type { BackendId } from '#src/recap/domain/backend.ts';
import { loadConfig } from '#src/daemon/config.ts';
import type { Config } from '#src/daemon/config.ts';
import { MAKERS } from '#src/daemon/harness-makers.ts';
import { CLAUDE_POLICY_ACK_DEFAULT } from '#src/recap/domain/claude-policy-ack.ts';
import { LibraryHarness } from '#src/adapters/harness/library.ts';
import { LIBRARY_IDS } from '#src/adapters/harness/library-constants.ts';
import { HarnessCurator } from '#src/adapters/job/curator.ts';
import { ANSWER_SCHEMAS } from '#src/adapters/job/prompts/answer-schemas.ts';
import { summarizerFor } from '#src/daemon/backends.ts';
import { must } from '#src/protocol/result.ts';
import { parseDirectory } from '#src/recap/domain/directory.ts';
import { RecapWriter } from '#src/adapters/job/writer.ts';
import { isUnknown, unknown } from '#src/ports/unknowable.ts';
import { requestOf } from '#test/support.ts';
import type { Milliseconds } from '#src/recap/domain/time.ts';
import { parseText } from '#src/recap/domain/text.ts';

const call = { instructions: 'do', input: 'in' };
const settings = { model: '', effort: 'low' } as const;

function scripted(id: 'claude' | 'codex' | 'opencode', ...items: Parameters<typeof fakeOutput>[0][]): PolicedRuntime {
    return fakeRuntime({ scripts: { [id]: items.map((item) => fakeOutput(item)) } });
}

function firstCall(runtime: PolicedRuntime): FakeCall {
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

const failing = (failure: RunFailure, id: 'claude' | 'codex' | 'opencode' = 'codex'): PolicedRuntime => fakeRuntime({ scripts: { [id]: [failure] } });

test('claude: login-store with the acknowledgement, tools off, a private deleted cwd, no persistence', async () => {
    const runtime = scripted('claude', { text: 'answer', cost: { usd: 0.02, basis: 'list' } });
    const ran = await new LibraryHarness(runtime, 'claude', 1234, undefined, true).run(call, settings);
    assert.deepEqual(ran, { kind: 'ran', text: 'answer', costUsd: 0.02, costBasis: 'list', confinement: [] });
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

test('the request has no timeoutMs without a per-call limit, and the headless options keep the constructor value', async () => {
    const runtime = scripted('claude', { text: 'answer' });
    await new LibraryHarness(runtime, 'claude', 1234, undefined, true).run(call, settings);
    const { options, request } = firstCall(runtime);
    assert.equal(Object.hasOwn(request, 'timeoutMs'), false);
    assert.equal(options.timeoutMs, 1234);
});

test('a per-call limit goes into the request as timeoutMs, and the headless options keep the constructor value', async () => {
    const runtime = scripted('claude', { text: 'answer' });
    await new LibraryHarness(runtime, 'claude', 1234, undefined, true).run(call, { ...settings, timeoutMs: 5000 as Milliseconds });
    const { options, request } = firstCall(runtime);
    assert.equal(request.timeoutMs, 5000);
    assert.equal(options.timeoutMs, 1234);
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
    assert.deepEqual(ran, { kind: 'ran', text: 'answer', costUsd: 0, costBasis: 'unavailable', confinement: [] });
    const { options, request } = firstCall(runtime);
    assert.deepEqual(options.credential, { mode: 'login-store' });
    assert.equal(options.persist, false);
    assert.deepEqual(request, { instructions: 'do', input: 'in', effort: 'harness-default' });
});

test('opencode: does not persist because its ephemeral cell is emulated, always the harness default effort, the job tag in the environment', async () => {
    const runtime = scripted('opencode', { text: 'answer' });
    const harness = new LibraryHarness(runtime, 'opencode', 1000, 'judge');
    await harness.run(call, { model: 'opencode/big-pickle', effort: 'high' });
    const first = firstCall(runtime);
    assert.equal(first.options.persist, false);
    assert.equal(first.request.effort, 'harness-default');
    assert.equal(first.request.model, 'opencode/big-pickle');
    assert.equal(transformOf(first)({})['OTEL_RESOURCE_ATTRIBUTES'], 'tab_recap.job=judge');
});

test('the result surfaces the confinement cells: an emulated, an unmeasured and a supported one with their axis and state', async () => {
    const cells = [
        { axis: 'builtins', requested: 'off', capability: 'builtin-tools-off', support: { state: 'emulated', how: 'prompt-level refusal' } },
        { axis: 'mcp', requested: 'none', capability: 'mcp-none', support: { state: 'unmeasured', question: 'does it load mcp?' } },
        { axis: 'settings', requested: 'none', capability: 'settings-sources', support: { state: 'supported' } },
    ] as const;
    const runtime = scripted('opencode', { text: 'answer', confinement: cells });
    const ran = await new LibraryHarness(runtime, 'opencode', 1000).run(call, settings);
    assert.ok(!isUnknown(ran));
    assert.deepEqual(ran.confinement, [
        { axis: 'builtins', state: 'emulated' },
        { axis: 'mcp', state: 'unmeasured' },
        { axis: 'settings', state: 'supported' },
    ]);
});

test('effort follows the effort capability: a harness whose effort cell is usable gets the level, an unmeasured one the harness default', async () => {
    const usable = scripted('codex', { text: 'a' });
    await new LibraryHarness(usable, 'codex', 1000).run(call, { model: '', effort: 'high' });
    assert.equal(firstCall(usable).request.effort, 'high');
});

test('opencode persists only while the ephemeral cell is unusable: an emulated cell turns persistence off', async () => {
    const base = fakeRuntime({ scripts: {} }).capabilities('opencode');
    assert.ok(base !== null);
    assert.equal(base[CapabilityName.Ephemeral][Engine.Cli].state, 'emulated');
    const flipped = { ...base, [CapabilityName.Ephemeral]: { ...base[CapabilityName.Ephemeral], [Engine.Cli]: { state: 'unmeasured', question: 'q' } } } as typeof base;
    const runtime = fakeRuntime({ scripts: { opencode: [fakeOutput({ text: 'answer' })] }, capabilities: { opencode: flipped } });
    await new LibraryHarness(runtime, 'opencode', 1000).run(call, settings);
    assert.equal(firstCall(runtime).options.persist, true);
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

test('answer text, or no answer: the call runs as before, one headless run', async () => {
    const absent = scripted('codex', { text: 'a' }, { text: 'b' });
    assert.equal((await new LibraryHarness(absent, 'codex', 1000).run(call, settings)).kind, 'ran');
    const text: HarnessCall = { ...call, answer: { kind: 'text' } };
    assert.equal((await new LibraryHarness(absent, 'codex', 1000).run(text, settings)).kind, 'ran');
    assert.equal(absent.calls.length, 2);
});

test('answer schema on a harness without structured output: Unknown failed with the detail, and no headless run starts', async () => {
    const runtime = scripted('opencode', { text: 'never' });
    const schema: HarnessCall = { ...call, answer: { kind: 'schema', schema: 'writer' } };
    const ran = await new LibraryHarness(runtime, 'opencode', 1000).run(schema, settings);
    assert.ok(isUnknown(ran) && ran.why.why === 'failed' && ran.why.code === 1 && ran.why.detail === 'structured output is not available in this harness library');
    assert.equal(runtime.calls.length, 0);
});

test('answer schema on claude: one run with the schema for the mode as outputSchema, and the output reaches the caller as its JSON text', async () => {
    const runtime = scripted('claude', { text: '', output: { ops: [], story: 'done' } });
    const schema: HarnessCall = { ...call, answer: { kind: 'schema', schema: 'story' } };
    const ran = await new LibraryHarness(runtime, 'claude', 1000, undefined, true).run(schema, settings);
    assert.ok(!isUnknown(ran) && ran.text === '{"ops":[],"story":"done"}');
    assert.equal(runtime.calls.length, 1);
    assert.deepEqual(firstCall(runtime).request.outputSchema, ANSWER_SCHEMAS.story);
});

test('answer text on claude: no outputSchema is sent', async () => {
    const runtime = scripted('claude', { text: 'plain' });
    await new LibraryHarness(runtime, 'claude', 1000, undefined, true).run({ ...call, answer: { kind: 'text' } }, settings);
    assert.equal(Object.hasOwn(firstCall(runtime).request, 'outputSchema'), false);
});

test('the library harness declares structured support from its capability: claude and codex schema, opencode none', () => {
    const runtime = fakeRuntime({ scripts: {} });
    assert.equal(new LibraryHarness(runtime, 'claude', 1000, undefined, true).structured, 'schema');
    assert.equal(new LibraryHarness(runtime, 'codex', 1000).structured, 'schema');
    assert.equal(new LibraryHarness(runtime, 'opencode', 1000).structured, 'none');
});

test('the curator over claude: a schema answer reaches the job as the run output, with the schema for the mode', async () => {
    const runtime = scripted('claude', { text: '', output: { ops: [{ op: 'close', id: 'f1', why: 'merged', into: 'f2' }], story: 'the story' } });
    const harness = new LibraryHarness(runtime, 'claude', 1000, undefined, true);
    const curated = await new HarnessCurator(harness, settings, 'schema').write(must(parseText('doc')), 'story');
    assert.deepEqual(curated, { kind: 'curated', text: textOf('{"ops":[{"op":"close","id":"f1","why":"merged","into":"f2"}],"story":"the story"}') });
    assert.deepEqual(firstCall(runtime).request.outputSchema, ANSWER_SCHEMAS.story);
});

test('the curator over opencode with a schema answer: the call falls back to text, one run without an outputSchema', async () => {
    const runtime = scripted('opencode', { text: '{"ops":[]}' });
    const curated = await new HarnessCurator(new LibraryHarness(runtime, 'opencode', 1000), settings, 'schema').write(must(parseText('doc')), 'reconcile');
    assert.deepEqual(curated, { kind: 'curated', text: textOf('{"ops":[]}') });
    assert.equal(runtime.calls.length, 1);
    assert.equal(Object.hasOwn(firstCall(runtime).request, 'outputSchema'), false);
});

test('the curator over opencode with a text answer: the run never carries an outputSchema', async () => {
    const runtime = scripted('opencode', { text: 'plain' });
    await new HarnessCurator(new LibraryHarness(runtime, 'opencode', 1000), settings, 'text').write(must(parseText('doc')), 'story');
    assert.equal(Object.hasOwn(firstCall(runtime).request, 'outputSchema'), false);
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
    const off = await MAKERS.claude({ ...config, claudePolicyAck: 'off' }, must(parseDirectory('/work')), refused).run(call, settings);
    assert.ok(isUnknown(off));
    assert.equal(refused.calls.length, 0);
    const allowed = scripted('claude', { text: 'x' });
    const on = await MAKERS.claude({ ...config, claudePolicyAck: 'on' }, must(parseDirectory('/work')), allowed).run(call, settings);
    assert.equal(on.kind, 'ran');
    assert.equal(allowed.calls.length, 1);
});

test('the acknowledgement comes from the library policy notice, not from a table: a notice on codex makes codex refuse too', async () => {
    const base = scripted('codex', { text: 'never' });
    const runtime: PolicedRuntime = { ...base, policyNotice: (id, mode) => (id === 'codex' && mode === 'login-store' ? { harness: 'claude', mode: 'login-store', quotes: [], retrievedAt: 'x' } : null) };
    const ran = await new LibraryHarness(runtime, 'codex', 1000).run(call, settings);
    assert.ok(isUnknown(ran));
    assert.equal(base.calls.length, 0);
});

const emulatedBuiltins = [
    { axis: 'builtins', requested: 'off', capability: 'builtin-tools-off', support: { state: 'emulated', how: 'prompt-level refusal' } },
    { axis: 'mcp', requested: 'none', capability: 'mcp-none', support: { state: 'unmeasured', question: 'does it load mcp?' } },
    { axis: 'settings', requested: 'none', capability: 'settings-sources', support: { state: 'supported' } },
] as const;

test('a run on a harness with an emulated cell is logged with the weak cells and nothing else', async () => {
    const lines: string[] = [];
    const runtime = scripted('opencode', { text: '## Goal\n- x', confinement: emulatedBuiltins, cost: { usd: 0.01, basis: 'billed' } });
    const writer = summarizerFor({ ...loadConfig(), backend: 'opencode' }, ['opencode'], must(parseDirectory(must(parseDirectory('/work')))), runtime, (line) => { lines.push(line); });
    const written = await writer.write(requestOf({ entries: ENTRIES }));
    assert.ok(!isUnknown(written));
    assert.deepEqual(lines, ['harness opencode: builtins emulated, mcp unmeasured']);
});

test('a run whose cost is unavailable says so in the same line, and a fully supported billed run logs nothing', async () => {
    const lines: string[] = [];
    const log = (line: string): void => { lines.push(line); };
    const config = { timeoutMs: 1000 } as Config;
    const codex = scripted('codex', { text: 'a', cost: { usd: null, basis: 'unavailable' } });
    await MAKERS.codex(config, must(parseDirectory('/work')), codex, undefined, log).run(call, settings);
    const opencode = scripted('opencode', { text: 'a', cost: { usd: 0.01, basis: 'billed' } });
    await MAKERS.opencode(config, must(parseDirectory('/work')), opencode, undefined, log).run(call, settings);
    const quiet = scripted('opencode', { text: 'a', cost: { usd: 0.01, basis: 'billed' } });
    await MAKERS.opencode(config, must(parseDirectory('/work')), quiet).run(call, settings);
    assert.deepEqual(lines, ['harness codex: cost unavailable']);
});

test('every library harness id reports tool support none', () => {
    const runtime = fakeRuntime({ scripts: {} });
    for (const id of Object.values(LIBRARY_IDS)) assert.equal(new LibraryHarness(runtime, id, 1000).tools, 'none');
});

function recordingHarness(structured: StructuredSupport | undefined, limit: number | null = null, result: Ran = { kind: 'ran', text: '{"ops":[]}', costUsd: 0 }): { readonly harness: Harness<BackendId>; readonly calls: HarnessCall[] } {
    const calls: HarnessCall[] = [];
    const harness: Harness<BackendId> = {
        id: 'claude',
        label: () => 'claude',
        limit,
        ...(structured === undefined ? {} : { structured }),
        run: (asked) => {
            calls.push(asked);
            return Promise.resolve(result);
        },
    };
    return { harness, calls };
}

test('answer schema on a schema harness: the writer asks for the writer schema and reads the answer as usual', async () => {
    const recorded = recordingHarness('schema');
    const written = await new RecapWriter(recorded.harness, { model: '', effort: 'default' }, 'schema').write(requestOf({ entries: ENTRIES }));
    assert.deepEqual(recorded.calls[0]?.answer, { kind: 'schema', schema: 'writer' });
    assert.equal(written.kind, 'written');
});

test('answer schema on a harness without structured support: the call has no answer key', async () => {
    const recorded = recordingHarness(undefined);
    await new RecapWriter(recorded.harness, { model: '', effort: 'default' }, 'schema').write(requestOf({ entries: ENTRIES }));
    assert.equal(recorded.calls.length, 1);
    assert.equal('answer' in (recorded.calls[0] ?? {}), false);
});

test('answer omitted on a schema harness: the call has no answer key', async () => {
    const recorded = recordingHarness('schema');
    await new RecapWriter(recorded.harness, { model: '', effort: 'default' }).write(requestOf({ entries: ENTRIES }));
    assert.equal(recorded.calls.length, 1);
    assert.equal('answer' in (recorded.calls[0] ?? {}), false);
});

test('answer schema on a fitted schema harness: the call carries the answer and the fitted input', async () => {
    const request = requestOf({ entries: ENTRIES });
    const fitted = recordingHarness('schema', 30_000);
    await new RecapWriter(fitted.harness, { model: '', effort: 'default' }, 'schema').write(request);
    const whole = recordingHarness('schema', null);
    await new RecapWriter(whole.harness, { model: '', effort: 'default' }, 'schema').write(request);
    const [fittedAsk] = fitted.calls;
    const [wholeAsk] = whole.calls;
    assert.ok(fittedAsk !== undefined && wholeAsk !== undefined);
    assert.deepEqual(fittedAsk.answer, { kind: 'schema', schema: 'writer' });
    assert.ok(Buffer.byteLength(fittedAsk.input) < Buffer.byteLength(wholeAsk.input));
});

test('answer schema on a library harness without structured output stays dark: one headless run with no output schema', async () => {
    const runtime = fakeRuntime({ scripts: { opencode: [fakeOutput({ text: '{"ops":[]}' })] } });
    const written = await new RecapWriter(new LibraryHarness(runtime, 'opencode', 1000), { model: '', effort: 'default' }, 'schema').write(requestOf({ entries: ENTRIES }));
    assert.equal(written.kind, 'written');
    assert.equal(runtime.calls.length, 1);
    assert.equal('outputSchema' in firstCall(runtime).request, false);
});

test('answer schema with a failed schema call: the writer returns that failure and makes no text retry', async () => {
    const failure = unknown({ why: 'not-found', what: 'writer' });
    const recorded = recordingHarness('schema', null, failure);
    const written = await new RecapWriter(recorded.harness, { model: '', effort: 'default' }, 'schema').write(requestOf({ entries: ENTRIES }));
    assert.equal(written, failure);
    assert.equal(recorded.calls.length, 1);
});
