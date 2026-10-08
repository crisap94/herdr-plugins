// Autocompact's configuration: the policy, the decider's job, the Jev settings, and which decider they build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessDecider } from '#src/adapters/harness-decider.ts';
import { JevDecider } from '#src/adapters/jev-decider.ts';
import { ceilingOf, cooldownOf, jevOf, kindsOf, modeOf, policyOf, softOf } from '#src/recap/domain/autocompact.ts';
import { DECIDER_BY_CHOICES, DECIDER_DEFAULT, deciderJobOf, JOB_BY_CHOICES } from '#src/recap/domain/job.ts';
import { deciderFor } from '#src/daemon/deciders.ts';
import { loadConfig } from '#src/daemon/config.ts';

const config = (values: Readonly<Record<string, string>>) => (key: string): string | undefined => values[key];

test('the policy defaults: shadow, soft 40, ceiling 80, ten minutes, claude only', () => {
    assert.deepEqual(policyOf(config({})), { mode: 'shadow', soft: 40, ceiling: 80, cooldownMs: 600_000, kinds: ['claude'] });
});

test('the mode: off, shadow or on (any case); anything else is shadow', () => {
    assert.deepEqual([' ON ', 'Off', 'shadow', 'yes', '', undefined].map(modeOf), ['on', 'off', 'shadow', 'shadow', 'shadow', 'shadow']);
});

test('the soft limit is 10–95 (a % is allowed); outside it, or not a whole number, is 40', () => {
    assert.deepEqual(['10', '95', '55%', ' 70 '].map(softOf), [10, 95, 55, 70]);
    assert.deepEqual(['9', '96', '0', '-5', '40.5', 'x', '', undefined].map(softOf), Array.from({ length: 8 }, () => 40));
});

test('the ceiling is above the soft limit: 80 by default; one that is not becomes soft + 10, at most 95', () => {
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

test('the decider job: the recap writer\'s harness at low effort; it also takes jev; the other jobs do not', () => {
    assert.deepEqual(DECIDER_DEFAULT, { by: 'recap', model: '', effort: 'low' });
    assert.deepEqual(deciderJobOf(config({})), DECIDER_DEFAULT);
    assert.deepEqual(deciderJobOf(config({ TAB_RECAP_AUTOCOMPACT_BY: ' JEV ', TAB_RECAP_AUTOCOMPACT_MODEL: 'x', TAB_RECAP_AUTOCOMPACT_EFFORT: 'medium' })), { by: 'jev', model: 'x', effort: 'medium' });
    assert.deepEqual(['recap', 'auto', 'claude', 'codex', 'opencode', 'hermes', 'custom', 'off'].map((by) => deciderJobOf(config({ TAB_RECAP_AUTOCOMPACT_BY: by })).by), ['recap', 'auto', 'claude', 'codex', 'opencode', 'hermes', 'custom', 'off']);
    assert.equal(deciderJobOf(config({ TAB_RECAP_AUTOCOMPACT_BY: 'nonsense' })).by, 'recap');
    assert.equal(JOB_BY_CHOICES.includes('jev' as never), false, 'the other jobs keep their choices');
    assert.deepEqual(DECIDER_BY_CHOICES, [...JOB_BY_CHOICES.slice(0, -1), 'jev', 'off']);
});

test('the Jev settings: the TypeSafe endpoint and the pinned model unless set; a URL that is not http(s) is the default', () => {
    assert.deepEqual(jevOf(config({})), { url: 'https://api.typesafe.ai/v1/systemone', model: 'jev-1.13.0' });
    assert.deepEqual(jevOf(config({ TAB_RECAP_JEV_URL: 'http://gateway.local/v1/systemone', TAB_RECAP_JEV_MODEL: 'jev-2' })), { url: 'http://gateway.local/v1/systemone', model: 'jev-2' });
    assert.equal(jevOf(config({ TAB_RECAP_JEV_URL: 'ftp://x' })).url, 'https://api.typesafe.ai/v1/systemone');
});

/** Runs `body` with these environment variables set (and an empty config folder), then puts everything back. */
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
        assert.deepEqual([loaded.autocompact.mode, loaded.autocompact.soft, loaded.autocompact.ceiling, loaded.decider, loaded.jev.model], ['on', 55, 80, { by: 'recap', model: '', effort: 'low' }, 'jev-9']);
    });
});
