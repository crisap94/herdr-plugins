import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ask, choice, fakeOutput, fakeRuntime, libraryHarness } from '#test/fakes/harness-runtime.ts';
import { mergeJobAttributes, SCRUBBED_ENV_NAMES, scrubbedFrom, scrubEnvironment, scrubbedEnv, serializeJobAttributes } from '#src/adapters/os/process/control.ts';
import { textOf, type Text } from '#src/recap/domain/text.ts';
import { JOB_TAGS } from '#src/recap/domain/job-tag.ts';
import type { JobTag } from '#src/recap/domain/job-tag.ts';

test('the sole serializer encodes every closed tag', () => {
    for (const tag of JOB_TAGS) {
        assert.equal(serializeJobAttributes({ 'tab_recap.job': tag }), `tab_recap.job=${encodeURIComponent(tag)}`);
        assert.equal(encodeURIComponent(tag), tag);
    }
});

test('the resource merge preserves unrelated entries and replaces only the exact trimmed key', () => {
    assert.equal(mergeJobAttributes(undefined, { 'tab_recap.job': 'judge' }), 'tab_recap.job=judge');
    assert.equal(mergeJobAttributes(textOf(''), { 'tab_recap.job': 'judge' }), 'tab_recap.job=judge');
    assert.equal(mergeJobAttributes(textOf(',,a=b,,'), { 'tab_recap.job': 'judge' }), 'a=b,tab_recap.job=judge');
    assert.equal(mergeJobAttributes(textOf('x=a=b,broken,, =v, tab_recap.job =old,z=3'), { 'tab_recap.job': 'judge' }), 'x=a=b,broken, =v,z=3,tab_recap.job=judge');
    assert.equal(mergeJobAttributes(textOf('tab_recap.job-other=x, tab_recap.job=old'), { 'tab_recap.job': 'judge' }), 'tab_recap.job-other=x,tab_recap.job=judge');
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
    const settings = choice('', 'low');
    await libraryHarness(runtime, 'claude', 1000, 'recap-writer', true).run(ask('do', 'in'), settings);
    await libraryHarness(runtime, 'codex', 1000, 'judge').run(ask('do', 'in'), settings);
    await libraryHarness(runtime, 'opencode', 1000, 'curator').run(ask('do', 'in'), settings);
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

const scrubSource = (): NodeJS.ProcessEnv => ({
    HERDR_X: '1',
    TAB_RECAP_X: '1',
    [SCRUBBED_ENV_NAMES[0] ?? 'NONE']: '1',
    KEEP: '1',
    OTEL_RESOURCE_ATTRIBUTES: 'service.name=p, tab_recap.job =old',
});

const captureStderr = (action: () => void): string[] => {
    const priorWrite = process.stderr.write.bind(process.stderr);
    const lines: string[] = [];
    process.stderr.write = (chunk: string | Uint8Array): boolean => { lines.push(String(chunk)); return true; };
    try {
        action();
    } finally {
        process.stderr.write = priorWrite;
    }
    return lines;
};

test('scrubbing runs before tagging and the source is left unchanged', () => {
    const source = scrubSource();
    const before = { ...source };
    const tagged = scrubbedFrom(source, 'judge');
    assert.deepEqual(tagged, { ...scrubEnvironment(source, SCRUBBED_ENV_NAMES), OTEL_RESOURCE_ATTRIBUTES: 'service.name=p,tab_recap.job=judge' });
    assert.deepEqual(source, before);
});

test('the job tag guard runs after scrubbing and keeps the scrubbed environment untagged', () => {
    const source = scrubSource();
    let env: NodeJS.ProcessEnv = {};
    const lines = captureStderr(() => { env = scrubbedFrom(source, 'bad' as JobTag); });
    assert.deepEqual(env, scrubEnvironment(source, SCRUBBED_ENV_NAMES));
    assert.equal(env['OTEL_RESOURCE_ATTRIBUTES'], 'service.name=p, tab_recap.job =old');
    assert.equal(lines.length, 1);
});

const baseKeyOf = (entry: string): string | null => {
    const equals = entry.indexOf('=');
    return equals < 0 ? null : entry.slice(0, equals).trim();
};
const baseMerge = (inherited: string | undefined, tag: JobTag): string => {
    const kept = (inherited?.split(',') ?? []).filter((entry) => entry.length > 0 && baseKeyOf(entry) !== 'tab_recap.job');
    return [...kept, `tab_recap.job=${encodeURIComponent(tag)}`].join(',');
};

test('the merge matches the previous local merge for every tag and inherited value', () => {
    const inheritedValues: (string | undefined)[] = [undefined, '', ',,a=b,,', 'x=a=b,broken,, =v, tab_recap.job =old,z=3', 'tab_recap.job-other=x, tab_recap.job=old', 'tab_recap.job', '=x', ' , ', 'a=1,tab_recap.job=x,tab_recap.job=y', 'a=%2C'];
    for (const tag of JOB_TAGS) {
        for (const inherited of inheritedValues) {
            const expected = baseMerge(inherited, tag);
            const text: Text | undefined = inherited === undefined ? undefined : textOf(inherited);
            assert.equal(mergeJobAttributes(text, { 'tab_recap.job': tag }), expected);
            const env = inherited === undefined ? {} : { OTEL_RESOURCE_ATTRIBUTES: inherited };
            assert.equal(scrubbedFrom(env, tag)['OTEL_RESOURCE_ATTRIBUTES'], expected);
        }
    }
});
