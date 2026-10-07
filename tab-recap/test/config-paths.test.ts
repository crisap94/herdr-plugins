import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configPathsFor } from '#src/adapters/config-paths.ts';
import { configDir, stateDir } from '#src/daemon/config.ts';

test('Linux and macOS keep the paths herdr uses (~/.config), as before', () => {
    for (const platform of ['linux', 'macos'] as const) {
        assert.deepEqual(configPathsFor(platform, '/home/me', {}), {
            configDir: '/home/me/.config/herdr/plugins/config/tab-recap',
            stateDir: '/home/me/.local/state/herdr/plugins/tab-recap',
        });
    }
});

test('Windows keeps settings under %APPDATA% and state under %LOCALAPPDATA%, and falls back to the profile', () => {
    const given = configPathsFor('windows', '/u/me', { APPDATA: '/u/me/Roam', LOCALAPPDATA: '/u/me/Loc' });
    assert.match(given.configDir, /^\/u\/me\/Roam\/herdr\/plugins\/config\/tab-recap$/);
    assert.match(given.stateDir, /^\/u\/me\/Loc\/herdr\/plugins\/state\/tab-recap$/);
    const bare = configPathsFor('windows', '/u/me', {});
    assert.match(bare.configDir, /AppData\/Roaming\/herdr/);
    assert.match(bare.stateDir, /AppData\/Local\/herdr/);
});

test('herdr\'s own variables still win over the platform defaults', () => {
    const keys = ['HERDR_PLUGIN_CONFIG_DIR', 'HERDR_PLUGIN_STATE_DIR', 'TAB_RECAP_STATE'] as const;
    const saved = keys.map((key) => process.env[key]);
    try {
        delete process.env['TAB_RECAP_STATE'];
        process.env['HERDR_PLUGIN_CONFIG_DIR'] = '/given/config';
        process.env['HERDR_PLUGIN_STATE_DIR'] = '/given/state';
        assert.deepEqual([configDir(), stateDir()], ['/given/config', '/given/state']);
        delete process.env['HERDR_PLUGIN_CONFIG_DIR'];
        delete process.env['HERDR_PLUGIN_STATE_DIR'];
        assert.match(configDir(), /herdr[\\/]plugins[\\/]config[\\/]tab-recap$/);
        assert.match(stateDir(), /herdr[\\/]plugins[\\/]tab-recap$/);
    } finally {
        keys.forEach((key, at) => { const value = saved[at]; if (value === undefined) { delete process.env[key]; } else { process.env[key] = value; } });
    }
});
