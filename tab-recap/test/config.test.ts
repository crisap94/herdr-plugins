import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { FsRecapStore, fileKey } from '#src/adapters/fs-recap-store.ts';
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

test('FsRecapStore: a stored recap with no language reads back as English', () => {
        const dir = mkdtempSync(join(tmpdir(), 'recap-store-'));
    try {
        const store = new FsRecapStore(dir);
        store.writeRecap({ tab: 't', lanes: [], markdown: 'x', at: 1, running: false, backend: null, error: null, costUsd: 0, language: 'es' });
        assert.equal(store.readRecap('t')?.language, 'es');
        const file = join(dir, 'recaps');
        mkdirSync(file, { recursive: true });
        const legacy = { tab: 'u', lanes: [], markdown: 'x', at: 1, running: false, backend: null, error: null, costUsd: 0 };
        writeFileSync(join(file, `${fileKey('u')}.json`), JSON.stringify(legacy));
        assert.equal(store.readRecap('u')?.language, 'en');
    } finally {
        rmSync(dir, { recursive: true });
    }
});
