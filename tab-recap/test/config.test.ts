import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configGetter, loadConfig, parseEnv } from '#src/daemon/config.ts';

test('config.env: comments, blanks and quotes', () => {
    const values = parseEnv('# a comment\n\nTAB_RECAP_BACKEND=codex\nTAB_RECAP_MODEL="gpt-5-mini"\nnot a pair\n');
    assert.equal(values.get('TAB_RECAP_BACKEND'), 'codex');
    assert.equal(values.get('TAB_RECAP_MODEL'), 'gpt-5-mini');
    assert.equal(values.size, 2);
});

test('configGetter: the environment wins over config.env, and the file is re-read on every call', () => {
    const dir = mkdtempSync(join(tmpdir(), 'recap-config-'));
    const before = process.env['HERDR_PLUGIN_CONFIG_DIR'];
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
    } finally {
        delete process.env['TAB_RECAP_PROBE_B'];
        if (before === undefined) { delete process.env['HERDR_PLUGIN_CONFIG_DIR']; } else { process.env['HERDR_PLUGIN_CONFIG_DIR'] = before; }
        rmSync(dir, { recursive: true });
    }
});

test('loadConfig: locale and recap language — ui follows the locale, an explicit recap language wins, free text is sanitised', () => {
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
        assert.equal(loadConfig().recapLanguage, 'Deutsch');
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
