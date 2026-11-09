import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeOutput, fakeRuntime } from '@stateforge-labs/harness-adapters/testing';
import { LibraryHarness } from '#src/adapters/harness/library.ts';
import { RecapWriter } from '#src/adapters/job/writer.ts';
import { isUnknown } from '#src/ports/unknowable.ts';
import { requestOf } from '#test/support.ts';

const request = requestOf({ entries: [{ role: 'user', text: 'hi' }] });

const opencode = (runtime: ReturnType<typeof fakeRuntime>): RecapWriter => new RecapWriter(new LibraryHarness(runtime, 'opencode', 100), { model: '', effort: 'default' });

test('a timed-out opencode run is Unknown timeout and the plugin leaves the session cleanup to the library: one headless run, nothing else', async () => {
    const runtime = fakeRuntime({ scripts: { opencode: [{ kind: 'timeout', message: 'slow', timeoutMs: 100 }] } });
    const written = await opencode(runtime).write(request);
    assert.ok(isUnknown(written) && written.why.why === 'timeout');
    assert.equal(runtime.calls.length, 1);
    assert.equal(runtime.calls[0]?.id, 'opencode');
    assert.equal(runtime.plans.length, 0);
});

test('no opencode run asks to persist while the ephemeral cell is emulated, because the library deletes the session record itself', async () => {
    const runtime = fakeRuntime({ scripts: { opencode: [fakeOutput({ text: '## Goal\n- x' }), fakeOutput({ text: '## Goal\n- y' })] } });
    const first = await opencode(runtime).write(request);
    const second = await opencode(runtime).write(request);
    assert.ok(first.kind === 'written' && second.kind === 'written');
    assert.deepEqual(runtime.calls.map((each) => each.options.persist), [false, false]);
});

test('an opencode run is never given a title, a variant or a flag: the harness builds no argument list', async () => {
    const runtime = fakeRuntime({ scripts: { opencode: [fakeOutput({ text: 'ok' })] } });
    await opencode(runtime).write(request);
    const sent = runtime.calls[0];
    assert.deepEqual(Object.keys(sent?.request ?? {}).toSorted(), ['effort', 'input', 'instructions']);
    assert.equal(sent?.request.effort, 'harness-default');
});
