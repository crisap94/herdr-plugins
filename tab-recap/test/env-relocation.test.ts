import { test } from 'node:test';
import assert from 'node:assert/strict';
import { environmentName, jobEnvironmentNames } from '#src/recap/domain/backend.ts';
import { scrubEnvironment, scrubbedEnv } from '#src/adapters/process.ts';

test('scrubbedEnv preserves the current common prefixes and registered Claude names', () => {
    const saved = { ...process.env };
    try {
        for (const key of Object.keys(process.env)) {
            delete process.env[key];
        }
        Object.assign(process.env, {
            PATH: '/bin',
            HOME: '/home/test',
            HERDR_PLUGIN_CONFIG_DIR: '/tmp/config',
            TAB_RECAP_CLAUDE_MODEL: 'haiku',
            RETAINED: 'yes',
            ...Object.fromEntries(jobEnvironmentNames().map((name) => [name, 'scrub'])),
        });
        assert.deepEqual(Object.keys(scrubbedEnv()).toSorted(), ['HOME', 'PATH', 'RETAINED']);
    } finally {
        for (const key of Object.keys(process.env)) {
            delete process.env[key];
        }
        Object.assign(process.env, saved);
    }
});

test('a registered harness name extends the scrubbed set', () => {
    const extra = environmentName('EXTRA_HARNESS_SECRET');
    assert.deepEqual(scrubEnvironment({ KEEP: '1', EXTRA_HARNESS_SECRET: '2' }, [...jobEnvironmentNames(), extra]), { KEEP: '1' });
});
