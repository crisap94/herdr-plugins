import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ClaudeHarness } from '#src/adapters/claude-harness.ts';
import { CodexHarness } from '#src/adapters/codex-harness.ts';
import { mergeResourceAttributes, scrubEnvironment, scrubbedEnv, serializeJobAttributes } from '#src/adapters/process.ts';
import { JOB_HARNESSES, jobEnvironmentNames } from '#src/recap/domain/backend.ts';
import { JOB_TAGS } from '#src/recap/domain/job-tag.ts';
import type { JobTag } from '#src/recap/domain/job-tag.ts';
import type { RunOptions, RunResult, Runner } from '#src/ports/process-control.ts';

const ran: RunResult = { code: 0, stdout: '{"result":"ok","total_cost_usd":0}', stderr: '', timedOut: false };

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

test('tagging off returns the same scrubbed environment and leaves the parent unchanged', () => {
    const inherited = process.env['OTEL_RESOURCE_ATTRIBUTES'];
    try {
        process.env['OTEL_RESOURCE_ATTRIBUTES'] = 'service.name=parent,tab_recap.job=parent';
        const before = { ...process.env };
        const kept = new Set<string>(jobEnvironmentNames(JOB_HARNESSES));
        const expected = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('HERDR_') && !key.startsWith('TAB_RECAP_') && !kept.has(key)));
        assert.equal(JSON.stringify(scrubbedEnv()) === JSON.stringify(scrubEnvironment(expected, [])), true);
        assert.equal(JSON.stringify(process.env) === JSON.stringify(before), true);
    } finally {
        if (inherited === undefined) { delete process.env['OTEL_RESOURCE_ATTRIBUTES']; } else { process.env['OTEL_RESOURCE_ATTRIBUTES'] = inherited; }
    }
});

test('the tagged Claude and Codex adapters add the job resource attribute', async () => {
    const dir = join(tmpdir(), `job-telemetry-${process.pid}`);
    const envs: NodeJS.ProcessEnv[] = [];
    const runner: Runner = async (_command: string, args: readonly string[], options: RunOptions) => {
        envs.push(options.env);
        const outputAt = args.indexOf('-o');
        if (outputAt >= 0) {
            const output = args[outputAt + 1];
            if (output !== undefined) { writeFileSync(output, 'ok'); }
        }
        return ran;
    };
    await new ClaudeHarness(dir, 1000, runner, 'recap-writer').run({ input: 'in', instructions: 'do' }, { model: '', effort: 'low' });
    await new CodexHarness(dir, 1000, runner, 'judge').run({ input: 'in', instructions: 'do' }, { model: '', effort: 'low' });
    assert.equal(envs[0]?.['OTEL_RESOURCE_ATTRIBUTES']?.endsWith('tab_recap.job=recap-writer'), true);
    assert.equal(envs[1]?.['OTEL_RESOURCE_ATTRIBUTES']?.endsWith('tab_recap.job=judge'), true);
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
