import { test } from 'node:test';
import assert from 'node:assert/strict';
import { after } from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configGetter, loadConfig, parseEnv, recapLanguageSource } from '#src/daemon/config.ts';

const isolatedConfigDir = mkdtempSync(join(tmpdir(), 'recap-config-isolated-'));
process.env['HERDR_PLUGIN_CONFIG_DIR'] = isolatedConfigDir;
after(() => { rmSync(isolatedConfigDir, { recursive: true, force: true }); });

test('config.env: comments, blanks and quotes', () => {
    const values = parseEnv('# a comment\n\nTAB_RECAP_BACKEND=codex\nTAB_RECAP_MODEL="gpt-5-mini"\nnot a pair\n');
    assert.equal(values.get('TAB_RECAP_BACKEND'), 'codex');
    assert.equal(values.get('TAB_RECAP_MODEL'), 'gpt-5-mini');
    assert.equal(values.size, 2);
});

test('configGetter: the environment wins over config.env except for the two language keys, and the file is re-read on every call', () => {
    const dir = mkdtempSync(join(tmpdir(), 'recap-config-'));
    const before = process.env['HERDR_PLUGIN_CONFIG_DIR'];
    const language = [process.env['TAB_RECAP_LOCALE'], process.env['TAB_RECAP_RECAP_LANG']];
    process.env['HERDR_PLUGIN_CONFIG_DIR'] = dir;
    try {
        const get = configGetter();
        writeFileSync(join(dir, 'config.env'), 'TAB_RECAP_PROBE_A=one\nTAB_RECAP_PROBE_B=file\n');
        process.env['TAB_RECAP_PROBE_B'] = 'env';
        assert.equal(get('TAB_RECAP_PROBE_A'), 'one');
        assert.equal(get('TAB_RECAP_PROBE_B'), 'env');
        writeFileSync(join(dir, 'config.env'), 'TAB_RECAP_PROBE_A=two\n');
        assert.equal(get('TAB_RECAP_PROBE_A'), 'two');
        assert.equal(get('TAB_RECAP_PROBE_C'), undefined);
        writeFileSync(join(dir, 'config.env'), 'TAB_RECAP_LOCALE=es\n');
        process.env['TAB_RECAP_LOCALE'] = 'en';
        assert.equal(get('TAB_RECAP_LOCALE'), 'es', 'for a language key the file wins');
        process.env['TAB_RECAP_RECAP_LANG'] = 'Português';
        assert.equal(get('TAB_RECAP_RECAP_LANG'), 'Português', 'and the environment fills a language key the file lacks');
    } finally {
        if (language[0] === undefined) { delete process.env['TAB_RECAP_LOCALE']; } else { process.env['TAB_RECAP_LOCALE'] = language[0]; }
        if (language[1] === undefined) { delete process.env['TAB_RECAP_RECAP_LANG']; } else { process.env['TAB_RECAP_RECAP_LANG'] = language[1]; }
        delete process.env['TAB_RECAP_PROBE_B'];
        if (before === undefined) { delete process.env['HERDR_PLUGIN_CONFIG_DIR']; } else { process.env['HERDR_PLUGIN_CONFIG_DIR'] = before; }
        rmSync(dir, { recursive: true });
    }
});

test('loadConfig: locale and recap language — ui follows the locale, an explicit recap language wins, the settings file beats the environment for both, free text is sanitised', () => {
    const keys = ['HERDR_PLUGIN_CONFIG_DIR', 'TAB_RECAP_LOCALE', 'TAB_RECAP_RECAP_LANG', 'LC_ALL'] as const;
    const saved = keys.map((key) => process.env[key]);
    const dir = mkdtempSync(join(tmpdir(), 'recap-config-'));
    try {
        process.env['HERDR_PLUGIN_CONFIG_DIR'] = dir;
        process.env['LC_ALL'] = 'es_CL.UTF-8';
        delete process.env['TAB_RECAP_LOCALE'];
        delete process.env['TAB_RECAP_RECAP_LANG'];
        assert.deepEqual([loadConfig().locale, loadConfig().recapLanguage], ['es', 'es']);
        process.env['TAB_RECAP_LOCALE'] = 'en';
        assert.deepEqual([loadConfig().locale, loadConfig().recapLanguage], ['en', 'en']);
        writeFileSync(join(dir, 'config.env'), 'TAB_RECAP_RECAP_LANG=es\n');
        assert.deepEqual([loadConfig().locale, loadConfig().recapLanguage], ['en', 'es']);
        process.env['TAB_RECAP_RECAP_LANG'] = 'Deutsch!!';
        assert.equal(loadConfig().recapLanguage, 'es', 'the settings file wins over the environment for the recap language');
        writeFileSync(join(dir, 'config.env'), 'TAB_RECAP_LOCALE=es\n');
        assert.deepEqual([loadConfig().locale, loadConfig().recapLanguage], ['es', 'Deutsch'], 'the file wins for the interface language; a key it lacks comes from the environment, sanitised');
    } finally {
        keys.forEach((key, at) => { const value = saved[at]; if (value === undefined) { delete process.env[key]; } else { process.env[key] = value; } });
        rmSync(dir, { recursive: true });
    }
});


test('TAB_RECAP_EFFORT: medium unless set to low, high or default; anything else is medium', () => {
    const saved = process.env['TAB_RECAP_EFFORT'];
    try {
        delete process.env['TAB_RECAP_EFFORT'];
        assert.equal(loadConfig().effort, 'medium');
        for (const [raw, effort] of [['low', 'low'], ['HIGH', 'high'], ['default', 'default'], ['max', 'medium']] as const) {
            process.env['TAB_RECAP_EFFORT'] = raw;
            assert.equal(loadConfig().effort, effort, raw);
        }
    } finally {
        if (saved === undefined) { delete process.env['TAB_RECAP_EFFORT']; } else { process.env['TAB_RECAP_EFFORT'] = saved; }
    }
});

test('TAB_RECAP_TELEMETRY_TAGS: off unless explicitly on', () => {
    const saved = process.env['TAB_RECAP_TELEMETRY_TAGS'];
    try {
        delete process.env['TAB_RECAP_TELEMETRY_TAGS'];
        assert.equal(loadConfig().telemetryTags, 'off');
        process.env['TAB_RECAP_TELEMETRY_TAGS'] = 'on';
        assert.equal(loadConfig().telemetryTags, 'on');
        process.env['TAB_RECAP_TELEMETRY_TAGS'] = ' ON ';
        assert.equal(loadConfig().telemetryTags, 'on');
        process.env['TAB_RECAP_TELEMETRY_TAGS'] = 'invalid';
        assert.equal(loadConfig().telemetryTags, 'off');
    } finally {
        if (saved === undefined) { delete process.env['TAB_RECAP_TELEMETRY_TAGS']; } else { process.env['TAB_RECAP_TELEMETRY_TAGS'] = saved; }
    }
});

test('TAB_RECAP_CURATOR_REPAIR: off unless once; once in any case and spacing; anything else is off', () => {
    const saved = process.env['TAB_RECAP_CURATOR_REPAIR'];
    try {
        delete process.env['TAB_RECAP_CURATOR_REPAIR'];
        assert.equal(loadConfig().curatorRepair, 'off');
        for (const [raw, mode] of [['once', 'once'], [' ONCE ', 'once'], ['on', 'off'], ['off', 'off']] as const) {
            process.env['TAB_RECAP_CURATOR_REPAIR'] = raw;
            assert.equal(loadConfig().curatorRepair, mode, raw);
        }
    } finally {
        if (saved === undefined) { delete process.env['TAB_RECAP_CURATOR_REPAIR']; } else { process.env['TAB_RECAP_CURATOR_REPAIR'] = saved; }
    }
});

test('TAB_RECAP_WRITER_CLOSE_EVIDENCE: off unless on; on in any case and spacing; anything else is off', () => {
    const saved = process.env['TAB_RECAP_WRITER_CLOSE_EVIDENCE'];
    try {
        delete process.env['TAB_RECAP_WRITER_CLOSE_EVIDENCE'];
        assert.equal(loadConfig().writerCloseEvidence, 'off');
        for (const [raw, mode] of [['on', 'on'], [' ON ', 'on'], ['off', 'off'], ['maybe', 'off']] as const) {
            process.env['TAB_RECAP_WRITER_CLOSE_EVIDENCE'] = raw;
            assert.equal(loadConfig().writerCloseEvidence, mode, raw);
        }
    } finally {
        if (saved === undefined) { delete process.env['TAB_RECAP_WRITER_CLOSE_EVIDENCE']; } else { process.env['TAB_RECAP_WRITER_CLOSE_EVIDENCE'] = saved; }
    }
});

test('TAB_RECAP_WRITER_ANSWER: unset leaves the field absent; schema in any case and spacing; anything else is absent', () => {
    const saved = process.env['TAB_RECAP_WRITER_ANSWER'];
    try {
        delete process.env['TAB_RECAP_WRITER_ANSWER'];
        assert.equal('writerAnswer' in loadConfig(), false);
        for (const raw of ['text', 'json', '']) {
            process.env['TAB_RECAP_WRITER_ANSWER'] = raw;
            assert.equal('writerAnswer' in loadConfig(), false, raw);
        }
        for (const raw of [' Schema ', 'SCHEMA']) {
            process.env['TAB_RECAP_WRITER_ANSWER'] = raw;
            assert.equal(loadConfig().writerAnswer, 'schema', raw);
        }
    } finally {
        if (saved === undefined) { delete process.env['TAB_RECAP_WRITER_ANSWER']; } else { process.env['TAB_RECAP_WRITER_ANSWER'] = saved; }
    }
});

test('TAB_RECAP_RUN_DEBOUNCE_MS: a whole number of ms from 5000 to 300000 is the window; 0, unset or anything else is off', () => {
    const keys = ['HERDR_PLUGIN_CONFIG_DIR', 'TAB_RECAP_RUN_DEBOUNCE_MS'] as const;
    const saved = keys.map((key) => process.env[key]);
    const dir = mkdtempSync(join(tmpdir(), 'recap-config-'));
    try {
        process.env['HERDR_PLUGIN_CONFIG_DIR'] = dir;
        delete process.env['TAB_RECAP_RUN_DEBOUNCE_MS'];
        assert.deepEqual(loadConfig().recapDebounce, { kind: 'off' });
        for (const [raw, expected] of [['60000', { kind: 'window', window: 60000 }], [' 60000 ', { kind: 'window', window: 60000 }], ['5000', { kind: 'window', window: 5000 }], ['300000', { kind: 'window', window: 300000 }], ['0', { kind: 'off' }], ['4999', { kind: 'off' }], ['300001', { kind: 'off' }], ['5000.5', { kind: 'off' }], ['soon', { kind: 'off' }]] as const) {
            process.env['TAB_RECAP_RUN_DEBOUNCE_MS'] = raw;
            assert.deepEqual(loadConfig().recapDebounce, expected, raw);
        }
        delete process.env['TAB_RECAP_RUN_DEBOUNCE_MS'];
        writeFileSync(join(dir, 'config.env'), 'TAB_RECAP_RUN_DEBOUNCE_MS=60000\n');
        assert.deepEqual(loadConfig().recapDebounce, { kind: 'window', window: 60000 });
    } finally {
        rmSync(dir, { recursive: true, force: true });
        keys.forEach((key, at) => { const value = saved[at]; if (value === undefined) { delete process.env[key]; } else { process.env[key] = value; } });
    }
});

test('TAB_RECAP_KEEP_DAYS: 30 unless set to whole days; 0 keeps everything', () => {
    const saved = process.env['TAB_RECAP_KEEP_DAYS'];
    try {
        delete process.env['TAB_RECAP_KEEP_DAYS'];
        assert.equal(loadConfig().keepDays, 30);
        for (const [raw, days] of [['7', 7], ['0', 0], ['soon', 30], ['-2', 30]] as const) {
            process.env['TAB_RECAP_KEEP_DAYS'] = raw;
            assert.equal(loadConfig().keepDays, days, raw);
        }
    } finally {
        if (saved === undefined) { delete process.env['TAB_RECAP_KEEP_DAYS']; } else { process.env['TAB_RECAP_KEEP_DAYS'] = saved; }
    }
});

test('loadConfig: the brief job is read from config.env — defaults, overrides, invalid values', () => {
    const dir = mkdtempSync(join(tmpdir(), 'recap-config-'));
    const before = process.env['HERDR_PLUGIN_CONFIG_DIR'];
    process.env['HERDR_PLUGIN_CONFIG_DIR'] = dir;
    try {
        assert.deepEqual(loadConfig().brief, { by: 'recap', model: '', effort: 'high' });
        writeFileSync(join(dir, 'config.env'), 'TAB_RECAP_COMPACT_BY=codex\nTAB_RECAP_COMPACT_MODEL=gpt-6-luna\nTAB_RECAP_COMPACT_EFFORT=medium\n');
        assert.deepEqual(loadConfig().brief, { by: 'codex', model: 'gpt-6-luna', effort: 'medium' });
        writeFileSync(join(dir, 'config.env'), 'TAB_RECAP_COMPACT_BY=skynet\nTAB_RECAP_COMPACT_EFFORT=max\n');
        assert.deepEqual(loadConfig().brief, { by: 'recap', model: '', effort: 'high' });
        writeFileSync(join(dir, 'config.env'), 'TAB_RECAP_COMPACT_BY=off\n');
        assert.equal(loadConfig().brief.by, 'off');
    } finally {
        if (before === undefined) { delete process.env['HERDR_PLUGIN_CONFIG_DIR']; } else { process.env['HERDR_PLUGIN_CONFIG_DIR'] = before; }
        rmSync(dir, { recursive: true });
    }
});

test('recapLanguageSource: the settings file, then the environment, then the system language', () => {
    const keys = ['HERDR_PLUGIN_CONFIG_DIR', 'TAB_RECAP_LOCALE', 'TAB_RECAP_RECAP_LANG', 'LC_ALL'] as const;
    const saved = keys.map((key) => process.env[key]);
    const dir = mkdtempSync(join(tmpdir(), 'recap-config-'));
    try {
        process.env['HERDR_PLUGIN_CONFIG_DIR'] = dir;
        process.env['LC_ALL'] = 'es_CL.UTF-8';
        delete process.env['TAB_RECAP_LOCALE'];
        delete process.env['TAB_RECAP_RECAP_LANG'];
        assert.equal(recapLanguageSource(), 'system');
        process.env['TAB_RECAP_LOCALE'] = 'en';
        assert.equal(recapLanguageSource(), 'environment');
        writeFileSync(join(dir, 'config.env'), 'TAB_RECAP_LOCALE=es\n');
        assert.equal(recapLanguageSource(), 'settings');
        writeFileSync(join(dir, 'config.env'), 'TAB_RECAP_LOCALE=auto\n');
        assert.equal(recapLanguageSource(), 'system', 'auto in the settings file follows the system language whatever the environment says');
        process.env['TAB_RECAP_RECAP_LANG'] = 'Deutsch';
        assert.equal(recapLanguageSource(), 'environment');
        writeFileSync(join(dir, 'config.env'), 'TAB_RECAP_RECAP_LANG=es\n');
        assert.equal(recapLanguageSource(), 'settings');
    } finally {
        keys.forEach((key, at) => { const value = saved[at]; if (value === undefined) { delete process.env[key]; } else { process.env[key] = value; } });
        rmSync(dir, { recursive: true });
    }
});

test('TAB_RECAP_RUN_PACING: smart by default; turn only when set to turn; smart takes the quiet and max wait in ms, and bad values fall back to smart or the defaults', () => {
    const keys = ['HERDR_PLUGIN_CONFIG_DIR', 'TAB_RECAP_RUN_PACING', 'TAB_RECAP_RUN_QUIET_MS', 'TAB_RECAP_RUN_MAX_WAIT_MS'] as const;
    const saved = keys.map((key) => process.env[key]);
    const dir = mkdtempSync(join(tmpdir(), 'recap-config-'));
    try {
        process.env['HERDR_PLUGIN_CONFIG_DIR'] = dir;
        for (const key of keys.slice(1)) delete process.env[key];
        assert.deepEqual(loadConfig().pacing, { kind: 'smart', quiet: 45000, maxWait: 1200000 });
        process.env['TAB_RECAP_RUN_PACING'] = ' Turn ';
        assert.deepEqual(loadConfig().pacing, { kind: 'turn' });
        process.env['TAB_RECAP_RUN_PACING'] = ' Smart ';
        assert.deepEqual(loadConfig().pacing, { kind: 'smart', quiet: 45000, maxWait: 1200000 });
        process.env['TAB_RECAP_RUN_QUIET_MS'] = '20000';
        process.env['TAB_RECAP_RUN_MAX_WAIT_MS'] = '90000';
        assert.deepEqual(loadConfig().pacing, { kind: 'smart', quiet: 20000, maxWait: 90000 });
        for (const [quiet, maxWait, expected] of [['9999', '90000', { quiet: 45000, maxWait: 90000 }], ['600001', '90000', { quiet: 45000, maxWait: 90000 }], ['20000', '59999', { quiet: 20000, maxWait: 1200000 }], ['soon', 'soon', { quiet: 45000, maxWait: 1200000 }]] as const) {
            process.env['TAB_RECAP_RUN_QUIET_MS'] = quiet;
            process.env['TAB_RECAP_RUN_MAX_WAIT_MS'] = maxWait;
            assert.deepEqual(loadConfig().pacing, { kind: 'smart', ...expected }, `${quiet} ${maxWait}`);
        }
        process.env['TAB_RECAP_RUN_PACING'] = 'hurry';
        assert.deepEqual(loadConfig().pacing, { kind: 'smart', quiet: 45000, maxWait: 1200000 });
    } finally {
        keys.forEach((key, at) => { const value = saved[at]; if (value === undefined) { delete process.env[key]; } else { process.env[key] = value; } });
        rmSync(dir, { recursive: true, force: true });
    }
});
