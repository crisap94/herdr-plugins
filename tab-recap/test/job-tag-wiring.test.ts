import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fakeOutput, fakeRuntime } from '@stateforge-labs/harness-adapters/testing';
import type { FakeRuntime } from '@stateforge-labs/harness-adapters/testing';
import { briefFor, curatorFor, enumeratorFor, judgeFor, summarizerFor } from '#src/daemon/backends.ts';
import { coverageDeciderFor, deciderFor } from '#src/daemon/deciders.ts';
import { loadConfig } from '#src/daemon/config.ts';
import type { Config } from '#src/daemon/config.ts';
import type { RecapInput } from '#src/ports/recap-input.ts';
import type { JobTag } from '#src/recap/domain/job-tag.ts';

interface Site {
    readonly name: string;
    readonly tag: JobTag;
    readonly call: (config: Config, available: readonly string[], work: string, runtime: FakeRuntime) => Promise<unknown>;
}

const EMPTY_INPUT: RecapInput = { tab: { id: 'tab', now: 0, zone: 'UTC' }, agents: [], tasks: [], ledgers: [], notes: [], transcripts: [] };

const WRITE: Site = { name: 'summarizerFor', tag: 'recap-writer', call: (config, available, work, runtime) => summarizerFor(config, available, work, runtime).write({ input: EMPTY_INPUT, language: 'en', previousLanguage: 'en' }) };

const SITES: readonly Site[] = [
    WRITE,
    { name: 'enumeratorFor', tag: 'recap-writer', call: (config, available, work, runtime) => enumeratorFor(config, available, work, runtime)?.write('document') ?? Promise.resolve(null) },
    { name: 'briefFor', tag: 'compaction-brief', call: (config, available, work, runtime) => briefFor(config, available, work, runtime)?.write('document') ?? Promise.resolve(null) },
    { name: 'judgeFor', tag: 'judge', call: (config, available, work, runtime) => judgeFor(config, available, work, runtime)?.ask('score', 'document') ?? Promise.resolve(null) },
    { name: 'curatorFor', tag: 'curator', call: (config, available, work, runtime) => curatorFor(config, available, work, runtime)?.write('document') ?? Promise.resolve(null) },
    { name: 'deciderFor', tag: 'decider', call: (config, available, work, runtime) => deciderFor(config, available, work, runtime)?.ask({}, {}) ?? Promise.resolve(null) },
    { name: 'coverageDeciderFor', tag: 'coverage-check', call: (config, available, work, runtime) => coverageDeciderFor(config, available, work, runtime)?.ask({}, {}) ?? Promise.resolve(null) },
];

const SETTING_KEYS = ['HERDR_PLUGIN_CONFIG_DIR', 'PATH', 'TAB_RECAP_BACKEND', 'TAB_RECAP_CUSTOM_CMD', 'TAB_RECAP_TELEMETRY_TAGS', 'TAB_RECAP_CLAUDE_POLICY_ACK', 'TAB_RECAP_AUTOCOMPACT_BY', 'TAB_RECAP_AUTOCOMPACT_COVERAGE_BY', 'OTEL_RESOURCE_ATTRIBUTES'];

const FAKE_BINARY = `#!/bin/sh
cat > /dev/null
printf '%s' "$OTEL_RESOURCE_ATTRIBUTES" > "$(dirname "$0")/$(basename "$0").env"
printf '%s' '{"result":"ok","total_cost_usd":0}'
`;

const CUSTOM_COMMAND = 'tab-recap-fake-custom';

type Backend = 'claude' | 'codex' | 'opencode' | 'custom';

async function withSettings<T>(backend: Backend, tagging: 'on' | 'off', inherited: string | undefined, body: (root: string) => Promise<T>): Promise<T> {
    const root = mkdtempSync(join(tmpdir(), 'job-tag-wiring-'));
    const bin = join(root, 'bin');
    const saved = SETTING_KEYS.map((key) => process.env[key]);
    SETTING_KEYS.forEach((key) => { delete process.env[key]; });
    try {
        mkdirSync(bin);
        writeFileSync(join(bin, CUSTOM_COMMAND), FAKE_BINARY);
        chmodSync(join(bin, CUSTOM_COMMAND), 0o755);
        Object.assign(process.env, {
            HERDR_PLUGIN_CONFIG_DIR: join(root, 'config'),
            PATH: `${bin}${delimiter}${saved[1] ?? ''}`,
            TAB_RECAP_BACKEND: backend,
            TAB_RECAP_CUSTOM_CMD: CUSTOM_COMMAND,
            TAB_RECAP_TELEMETRY_TAGS: tagging,
            TAB_RECAP_CLAUDE_POLICY_ACK: 'on',
            TAB_RECAP_AUTOCOMPACT_BY: 'recap',
            TAB_RECAP_AUTOCOMPACT_COVERAGE_BY: 'decider',
            ...(inherited === undefined ? {} : { OTEL_RESOURCE_ATTRIBUTES: inherited }),
        });
        return await body(root);
    } finally {
        SETTING_KEYS.forEach((key, at) => { const before = saved[at]; if (before === undefined) { delete process.env[key]; } else { process.env[key] = before; } });
        rmSync(root, { recursive: true, force: true });
    }
}

async function libraryEnvSeenBy(backend: Exclude<Backend, 'custom'>, tagging: 'on' | 'off', site: Site, inherited: string | undefined): Promise<string> {
    return withSettings(backend, tagging, inherited, async (root) => {
        const runtime = fakeRuntime({ scripts: { [backend]: [fakeOutput({ text: 'ok' }), fakeOutput({ text: 'ok' })] } });
        await site.call(loadConfig(), [backend], join(root, 'work'), runtime);
        const env = runtime.calls[0]?.options.env;
        assert.ok(env?.kind === 'inherit' && env.transform !== undefined, 'the run carries an environment transform');
        return env.transform(inherited === undefined ? {} : { OTEL_RESOURCE_ATTRIBUTES: inherited })['OTEL_RESOURCE_ATTRIBUTES'] ?? '';
    });
}

async function customEnvSeenBy(site: Site, inherited: string): Promise<string> {
    return withSettings('custom', 'on', inherited, async (root) => {
        await site.call(loadConfig(), ['custom'], join(root, 'work'), fakeRuntime({ scripts: {} }));
        return readFileSync(join(root, 'bin', `${CUSTOM_COMMAND}.env`), 'utf8');
    });
}

for (const backend of ['claude', 'codex', 'opencode'] as const) {
    for (const site of SITES) {
        test(`${site.name} on ${backend}: the run's environment carries '${site.tag}' in OTEL_RESOURCE_ATTRIBUTES when tagging is on`, async () => {
            assert.equal(await libraryEnvSeenBy(backend, 'on', site, undefined), `tab_recap.job=${site.tag}`);
        });

        test(`${site.name} on ${backend}: the run's environment carries no job tag when tagging is off`, async () => {
            assert.equal(await libraryEnvSeenBy(backend, 'off', site, undefined), '');
        });
    }
}

test('custom: the child gets no job tag with tagging on, and an inherited OTEL_RESOURCE_ATTRIBUTES passes through unchanged', async () => {
    assert.equal(await customEnvSeenBy(WRITE, 'service.name=parent,team=ops'), 'service.name=parent,team=ops');
});

for (const backend of ['claude', 'codex', 'opencode'] as const) {
    test(`${backend}: an inherited OTEL_RESOURCE_ATTRIBUTES is kept with the job tag appended`, async () => {
        assert.equal(await libraryEnvSeenBy(backend, 'on', WRITE, 'service.name=parent,tab_recap.job=old'), 'service.name=parent,tab_recap.job=recap-writer');
    });
}
