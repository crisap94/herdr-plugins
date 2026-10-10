import { test } from 'node:test';
import assert from 'node:assert/strict';
import { environmentName, JOB_HARNESSES, jobEnvironmentNames } from '#src/recap/domain/backend.ts';
import { scrubEnvironment, scrubbedEnv } from '#src/adapters/process.ts';

const fixtureEnvironment: NodeJS.ProcessEnv = {
    HERDR_ENV: 'scrub',
    HERDR_X: 'scrub',
    TAB_RECAP_FOO: 'scrub',
    CLAUDECODE: 'scrub',
    CLAUDE_CODE_ENTRYPOINT: 'scrub',
    OTEL_EXPORTER_X: 'keep',
    ANTHROPIC_API_KEY: 'keep',
    CODEX_HOME: 'keep',
    TAB_RECAPX: 'keep',
    CLAUDE_CODE_OTHER: 'keep',
    CLAUDECODEX: 'keep',
    claudecode: 'keep',
    EMPTY_VALUE: '',
    'SPACED KEY': 'keep',
    PATH: '/bin',
    HOME: '/home/test',
};

const expectedKeys = ['ANTHROPIC_API_KEY', 'CLAUDECODEX', 'CLAUDE_CODE_OTHER', 'CODEX_HOME', 'EMPTY_VALUE', 'HOME', 'OTEL_EXPORTER_X', 'PATH', 'SPACED KEY', 'TAB_RECAPX', 'claudecode'];

test('scrubbedEnv preserves literal retained keys and removes literal scrub names', () => {
    const saved = { ...process.env };
    try {
        for (const key of Object.keys(process.env)) {
            delete process.env[key];
        }
        Object.assign(process.env, fixtureEnvironment);
        assert.deepEqual(Object.keys(scrubbedEnv()).toSorted(), expectedKeys);
    } finally {
        for (const key of Object.keys(process.env)) {
            delete process.env[key];
        }
        Object.assign(process.env, saved);
    }
});

test('a harness declared extra name is included in the scrubbed set', () => {
    const extra = environmentName('EXTRA_HARNESS_SECRET');
    const harnesses = [...JOB_HARNESSES, { job: { envScrub: [extra] } }];
    const names = jobEnvironmentNames(harnesses);
    assert.deepEqual(scrubEnvironment({ KEEP: '1', EXTRA_HARNESS_SECRET: '2' }, names), { KEEP: '1' });
});
