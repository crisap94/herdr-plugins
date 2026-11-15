import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeOutput, fakeRuntime } from '#test/fakes/harness-runtime.ts';
import { LibraryHarness } from '#src/adapters/harness/library.ts';
import { mergeResourceAttributes, SCRUBBED_ENV_NAMES, scrubEnvironment, scrubbedEnv, serializeJobAttributes } from '#src/adapters/os/process/control.ts';
import { JOB_TAGS } from '#src/recap/domain/job-tag.ts';
import type { JobTag } from '#src/recap/domain/job-tag.ts';

test('the sole serializer encodes every closed tag', () => {
    for (const tag of JOB_TAGS) {
        assert.equal(serializeJobAttributes({ 'tab_recap.job': tag }), `tab_recap.job=${encodeURIComponent(tag)}`);
        assert.equal(encodeURIComponent(tag), tag);
    }
});

test('the resource merge preserves unrelated entries and replaces only the exact trimmed key', () => {
    assert.equal(mergeResourceAttributes(undefined, { 'tab_recap.job': 'judge' }), 'tab_recap.job=judge');
    assert.equal(mergeResourceAttributes('', { 'tab_recap.job': 'judge' }), 'tab_recap.job=judge');
    assert.equal(mergeResourceAttributes(',,a=b,,', { 'tab_recap.job': 'judge' }), 'a=b,tab_recap.job=judge');
    assert.equal(mergeResourceAttributes('x=a=b,broken,, =v, tab_recap.job =old,z=3', { 'tab_recap.job': 'judge' }), 'x=a=b,broken, =v,z=3,tab_recap.job=judge');
    assert.equal(mergeResourceAttributes('tab_recap.job-other=x, tab_recap.job=old', { 'tab_recap.job': 'judge' }), 'tab_recap.job-other=x,tab_recap.job=judge');
});

test('tagging off returns the scrubbed environment and leaves the parent unchanged', () => {
    const probes = ['HERDR_PROBE', 'TAB_RECAP_PROBE', ...SCRUBBED_ENV_NAMES.slice(0, 1)];
    const saved = [...probes, 'OTEL_RESOURCE_ATTRIBUTES'].map((key) => [key, process.env[key]] as const);
    try {
        for (const key of probes) { process.env[key] = 'probe'; }
        process.env['OTEL_RESOURCE_ATTRIBUTES'] = 'service.name=parent,tab_recap.job=parent';
        const before = { ...process.env };
        const expected = scrubEnvironment(process.env, SCRUBBED_ENV_NAMES);
        assert.equal(probes.every((key) => expected[key] === undefined), true);
        assert.deepEqual(scrubbedEnv(), expected);
        assert.deepEqual(scrubbedEnv(undefined), expected);
        assert.deepEqual({ ...process.env }, before);
    } finally {
        for (const [key, value] of saved) { if (value === undefined) { delete process.env[key]; } else { process.env[key] = value; } }
    }
});

test('tagging on leaves the parent environment unchanged', () => {
    const inherited = process.env['OTEL_RESOURCE_ATTRIBUTES'];
    try {
        process.env['OTEL_RESOURCE_ATTRIBUTES'] = 'service.name=parent,tab_recap.job=parent';
        const before = { ...process.env };
        assert.equal(scrubbedEnv('judge')['OTEL_RESOURCE_ATTRIBUTES'], 'service.name=parent,tab_recap.job=judge');
        assert.deepEqual({ ...process.env }, before);
    } finally {
        if (inherited === undefined) { delete process.env['OTEL_RESOURCE_ATTRIBUTES']; } else { process.env['OTEL_RESOURCE_ATTRIBUTES'] = inherited; }
    }
});

test('the tagged library harnesses add the job resource attribute to the environment they hand the runtime', async () => {
    const runtime = fakeRuntime({ scripts: { claude: [fakeOutput({ text: 'ok' })], codex: [fakeOutput({ text: 'ok' })], opencode: [fakeOutput({ text: 'ok' })] } });
    const settings = { model: '', effort: 'low' } as const;
    await new LibraryHarness(runtime, 'claude', 1000, 'recap-writer', true).run({ input: 'in', instructions: 'do' }, settings);
    await new LibraryHarness(runtime, 'codex', 1000, 'judge').run({ input: 'in', instructions: 'do' }, settings);
    await new LibraryHarness(runtime, 'opencode', 1000, 'curator').run({ input: 'in', instructions: 'do' }, settings);
    const seen = runtime.calls.map((each) => {
        const env = each.options.env;
        return env?.kind === 'inherit' && env.transform !== undefined ? env.transform({ OTEL_RESOURCE_ATTRIBUTES: 'service.name=parent' })['OTEL_RESOURCE_ATTRIBUTES'] : undefined;
    });
    assert.deepEqual(seen, ['service.name=parent,tab_recap.job=recap-writer', 'service.name=parent,tab_recap.job=judge', 'service.name=parent,tab_recap.job=curator']);
});

test('a serializer TypeError is logged once and leaves the job environment untagged', () => {
    const priorWrite = process.stderr.write.bind(process.stderr);
    const lines: string[] = [];
    process.stderr.write = (chunk: string | Uint8Array): boolean => { lines.push(String(chunk)); return true; };
    try {
        const env = scrubbedEnv('bad' as JobTag);
        assert.equal(env['OTEL_RESOURCE_ATTRIBUTES'], process.env['OTEL_RESOURCE_ATTRIBUTES']);
        assert.equal(lines.length, 1);
        assert.match(lines[0] ?? '', /could not add telemetry job tag/);
    } finally {
        process.stderr.write = priorWrite;
    }
});
