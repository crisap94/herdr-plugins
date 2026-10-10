import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessDecider } from '#src/adapters/harness-decider.ts';
import { JevDecider } from '#src/adapters/jev-decider.ts';
import { ceilingOf, coverageByOf, cooldownOf, COVERAGE_BY_DEFAULT, jevOf, kindsOf, modeOf, policyOf, minimumOf, shadowKindsOf } from '#src/recap/domain/autocompact.ts';
import { DECIDER_BY_CHOICES, DECIDER_DEFAULT, deciderJobOf, JOB_BY_CHOICES } from '#src/recap/domain/job.ts';
import { coverageDeciderFor, deciderFor } from '#src/daemon/deciders.ts';
import { loadConfig } from '#src/daemon/config.ts';
import { isUnknown } from '#src/ports/unknowable.ts';

const config = (values: Readonly<Record<string, string>>) => (key: string): string | undefined => values[key];
const jevUrl = (value: string): string => jevOf(config({ TAB_RECAP_JEV_URL: value })).url;

test('the policy defaults: shadow, minimum 10, ceiling 80, ten minutes, claude only', () => {
    assert.deepEqual(policyOf(config({})), { mode: 'shadow', minimum: 10, ceiling: 80, cooldownMs: 600_000, kinds: ['claude'], shadowKinds: [] });
});

test('the mode: off, shadow or on (any case); anything else is shadow', () => {
    assert.deepEqual([' ON ', 'Off', 'shadow', 'yes', '', undefined].map(modeOf), ['on', 'off', 'shadow', 'shadow', 'shadow', 'shadow']);
});

test('the minimum is 10–95 (a % is allowed); outside it, or not a whole number, is 10', () => {
    assert.deepEqual(['10', '95', '55%', ' 70 '].map(minimumOf), [10, 95, 55, 70]);
    assert.deepEqual(['9', '96', '0', '-5', '40.5', 'x', '', undefined].map(minimumOf), Array.from({ length: 8 }, () => 10));
});

test('the ceiling is above the minimum: 80 by default; one that is not becomes minimum + 10, at most 95', () => {
    assert.deepEqual([ceilingOf(undefined, 40), ceilingOf('90', 40), ceilingOf('x', 40)], [80, 90, 80]);
    assert.deepEqual([ceilingOf('40', 40), ceilingOf('30', 40), ceilingOf(undefined, 85), ceilingOf('85', 90), ceilingOf('95', 95)], [50, 50, 95, 95, 95]);
    assert.equal(policyOf(config({ TAB_RECAP_AUTOCOMPACT_AT: '60', TAB_RECAP_AUTOCOMPACT_CEILING: '50' })).ceiling, 70);
});

test('the cooldown is a whole number of milliseconds (0 allowed); nonsense is ten minutes', () => {
    assert.deepEqual(['0', '1000', ' 5 '].map(cooldownOf), [0, 1000, 5]);
    assert.deepEqual(['-1', '1.5', 'soon', '', undefined].map(cooldownOf), Array.from({ length: 5 }, () => 600_000));
});

test('the kinds are a comma list, lower-cased and de-duplicated; empty is claude', () => {
    assert.deepEqual(kindsOf(' Claude, codex ,,claude'), ['claude', 'codex']);
    assert.deepEqual([kindsOf(''), kindsOf(' , '), kindsOf(undefined)], [['claude'], ['claude'], ['claude']]);
});

test('shadow kinds parse registered transcript readers and default to none', () => {
    assert.deepEqual(shadowKindsOf(' Codex, opencode, codex, hermes, gemini, '), ['codex', 'opencode']);
    assert.deepEqual(shadowKindsOf(undefined), []);
    assert.deepEqual(policyOf(config({ TAB_RECAP_AUTOCOMPACT_SHADOW_KINDS: 'codex,opencode' })).shadowKinds, ['codex', 'opencode']);
});

test('the decider job: the recap writer\'s harness at low effort; it also takes jev; the other jobs do not', () => {
    assert.deepEqual(DECIDER_DEFAULT, { by: 'recap', model: '', effort: 'low' });
    assert.deepEqual(deciderJobOf(config({})), DECIDER_DEFAULT);
    assert.deepEqual(deciderJobOf(config({ TAB_RECAP_AUTOCOMPACT_BY: ' JEV ', TAB_RECAP_AUTOCOMPACT_MODEL: 'x', TAB_RECAP_AUTOCOMPACT_EFFORT: 'medium' })), { by: 'jev', model: 'x', effort: 'medium' });
    assert.deepEqual(['recap', 'auto', 'claude', 'codex', 'opencode', 'hermes', 'custom', 'off'].map((by) => deciderJobOf(config({ TAB_RECAP_AUTOCOMPACT_BY: by })).by), ['recap', 'auto', 'claude', 'codex', 'opencode', 'hermes', 'custom', 'off']);
    assert.equal(deciderJobOf(config({ TAB_RECAP_AUTOCOMPACT_BY: 'nonsense' })).by, 'recap');
    assert.equal(JOB_BY_CHOICES.includes('jev' as never), false, 'the other jobs keep their choices');
    assert.deepEqual(DECIDER_BY_CHOICES, [...JOB_BY_CHOICES.slice(0, -1), 'jev', 'off']);
});

test('the Jev settings: the TypeSafe endpoint and the pinned model unless set', () => {
    assert.deepEqual(jevOf(config({})), { url: 'https://api.typesafe.ai/v1/systemone', model: 'jev-1.13.0' });
    assert.deepEqual(jevOf(config({ TAB_RECAP_JEV_URL: 'https://gateway.example/v1/systemone', TAB_RECAP_JEV_MODEL: 'jev-2' })), { url: 'https://gateway.example/v1/systemone', model: 'jev-2' });
});

test('the Jev URL: https to any host, http only to loopback; anything else (clear-text http, other schemes, look-alike hosts) is the default', () => {
    for (const good of ['http://localhost:8080/v1', 'http://127.0.0.1/x', 'http://[::1]:9/v1', 'https://gateway.example:8443/v1']) assert.equal(jevUrl(good), good, good);
    for (const bad of ['http://gateway.local/v1/systemone', 'http://localhost.evil.example/v1', 'http://localhost@evil.example/', 'http://user@localhost', 'http://localhost:80@evil.example', 'https://','ftp://x', 'typesafe.ai']) {
        assert.equal(jevUrl(bad), 'https://api.typesafe.ai/v1/systemone', bad);
    }
});

function withEnv(values: Readonly<Record<string, string>>, body: () => void): void {
    const dir = mkdtempSync(join(tmpdir(), 'recap-autocompact-'));
    const keys = ['HERDR_PLUGIN_CONFIG_DIR', ...Object.keys(values)];
    const was = keys.map((key) => process.env[key]);
    Object.assign(process.env, { HERDR_PLUGIN_CONFIG_DIR: dir, ...values });
    try {
        body();
    } finally {
        keys.forEach((key, at) => { const before = was[at]; if (before === undefined) { delete process.env[key]; } else { process.env[key] = before; } });
        rmSync(dir, { recursive: true, force: true });
    }
}

async function withEnvAsync(values: Readonly<Record<string, string>>, body: () => Promise<void>): Promise<void> {
    const dir = mkdtempSync(join(tmpdir(), 'recap-autocompact-'));
    const keys = ['HERDR_PLUGIN_CONFIG_DIR', ...Object.keys(values)];
    const was = keys.map((key) => process.env[key]);
    Object.assign(process.env, { HERDR_PLUGIN_CONFIG_DIR: dir, ...values });
    try {
        await body();
    } finally {
        keys.forEach((key, at) => { const before = was[at]; if (before === undefined) { delete process.env[key]; } else { process.env[key] = before; } });
        rmSync(dir, { recursive: true, force: true });
    }
}

test('deciderFor: jev builds the Jev decider, a harness job a harness decider, off or nothing installed none', () => {
    withEnv({ TAB_RECAP_BACKEND: 'auto', TAB_RECAP_AUTOCOMPACT_BY: 'jev' }, () => {
        const jev = deciderFor(loadConfig(), [], '/work');
        assert.ok(jev instanceof JevDecider);
        assert.equal(jev.label, 'jev · jev-1.13.0');
    });
    withEnv({ TAB_RECAP_BACKEND: 'auto', TAB_RECAP_AUTOCOMPACT_BY: 'recap' }, () => {
        assert.ok(deciderFor(loadConfig(), ['claude'], '/work') instanceof HarnessDecider);
        assert.equal(deciderFor(loadConfig(), [], '/work'), null);
    });
    withEnv({ TAB_RECAP_BACKEND: 'auto', TAB_RECAP_AUTOCOMPACT_BY: 'off' }, () => {
        assert.equal(deciderFor(loadConfig(), ['claude'], '/work'), null);
    });
});

test('the loaded configuration carries the policy, the job and the Jev settings', () => {
    withEnv({ TAB_RECAP_AUTOCOMPACT: 'on', TAB_RECAP_AUTOCOMPACT_AT: '55', TAB_RECAP_JEV_MODEL: 'jev-9' }, () => {
        const loaded = loadConfig();
        assert.deepEqual([loaded.autocompact.mode, loaded.autocompact.minimum, loaded.autocompact.ceiling, loaded.decider, loaded.jev.model], ['on', 55, 80, { by: 'recap', model: '', effort: 'low' }, 'jev-9']);
    });
});

test('the brief coverage decider: auto (the default), jev or decider; anything else is auto', () => {
    assert.equal(COVERAGE_BY_DEFAULT, 'auto');
    assert.deepEqual([' JEV ', 'Decider', 'auto', 'nonsense', '', undefined].map(coverageByOf), ['jev', 'decider', 'auto', 'auto', 'auto', 'auto']);
    assert.equal(loadConfig().coverage, 'auto');
});

function withHome(body: () => void): void {
    const home = mkdtempSync(join(tmpdir(), 'recap-home-'));
    const was = process.env['HOME'];
    process.env['HOME'] = home;
    try {
        body();
    } finally {
        if (was === undefined) { delete process.env['HOME']; } else { process.env['HOME'] = was; }
        rmSync(home, { recursive: true, force: true });
    }
}

test('coverageDeciderFor: auto picks Jev when a key is found, else the moment decider', () => {
    withHome(() => withEnv({ TAB_RECAP_BACKEND: 'auto', TAB_RECAP_JEV_KEY: 'sk-test-coverage' }, () => {
        assert.ok(coverageDeciderFor(loadConfig(), ['claude'], '/work') instanceof JevDecider);
    }));
    withHome(() => withEnv({ TAB_RECAP_BACKEND: 'auto' }, () => {
        assert.ok(coverageDeciderFor(loadConfig(), ['claude'], '/work') instanceof HarnessDecider);
        assert.equal(coverageDeciderFor(loadConfig(), [], '/work'), null, 'no key and no harness: no decider, so the check does not run');
    }));
});

test('coverageDeciderFor: decider is the moment decider even with a key; jev is Jev always', () => {
    withHome(() => withEnv({ TAB_RECAP_BACKEND: 'auto', TAB_RECAP_JEV_KEY: 'sk-test-coverage', TAB_RECAP_AUTOCOMPACT_COVERAGE_BY: 'decider' }, () => {
        assert.ok(coverageDeciderFor(loadConfig(), ['claude'], '/work') instanceof HarnessDecider);
    }));
    withHome(() => withEnv({ TAB_RECAP_BACKEND: 'auto', TAB_RECAP_AUTOCOMPACT_COVERAGE_BY: 'jev' }, () => {
        assert.ok(coverageDeciderFor(loadConfig(), ['claude'], '/work') instanceof JevDecider);
    }));
});

test('coverageDeciderFor: jev with no key cannot answer, so the check fails closed', async () => {
    const home = mkdtempSync(join(tmpdir(), 'recap-home-'));
    const was = process.env['HOME'];
    process.env['HOME'] = home;
    try {
        await withEnvAsync({ TAB_RECAP_BACKEND: 'auto', TAB_RECAP_AUTOCOMPACT_COVERAGE_BY: 'jev' }, async () => {
            const decider = coverageDeciderFor(loadConfig(), ['claude'], '/work');
            assert.ok(decider instanceof JevDecider);
            assert.ok(isUnknown(await decider.ask({}, {})), 'an unknown answer, never a probability');
        });
    } finally {
        if (was === undefined) { delete process.env['HOME']; } else { process.env['HOME'] = was; }
        rmSync(home, { recursive: true, force: true });
    }
});
