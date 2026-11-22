import { test } from 'node:test';
import assert from 'node:assert/strict';
import { xdgPaths } from '#src/adapters/os/config/paths-xdg.ts';
import { configDirectory, stateDirectory } from '#src/daemon/config.ts';

test('the paths herdr uses (~/.config and ~/.local/state) are the defaults', () => {
    assert.deepEqual(xdgPaths('/home/me'), {
        configDir: '/home/me/.config/herdr/plugins/config/tab-recap',
        stateDir: '/home/me/.local/state/herdr/plugins/tab-recap',
    });
});

test('herdr\'s own variables still win over the platform defaults', () => {
    const keys = ['HERDR_PLUGIN_CONFIG_DIR', 'HERDR_PLUGIN_STATE_DIR', 'TAB_RECAP_STATE'] as const;
    const saved = keys.map((key) => process.env[key]);
    try {
        delete process.env['TAB_RECAP_STATE'];
        process.env['HERDR_PLUGIN_CONFIG_DIR'] = '/given/config';
        process.env['HERDR_PLUGIN_STATE_DIR'] = '/given/state';
        assert.deepEqual([configDirectory(), stateDirectory()], ['/given/config', '/given/state']);
        delete process.env['HERDR_PLUGIN_CONFIG_DIR'];
        delete process.env['HERDR_PLUGIN_STATE_DIR'];
        assert.match(configDirectory(), /herdr[\\/]plugins[\\/]config[\\/]tab-recap$/);
        assert.match(stateDirectory(), /herdr[\\/]plugins[\\/]tab-recap$/);
    } finally {
        keys.forEach((key, at) => { const value = saved[at]; if (value === undefined) { delete process.env[key]; } else { process.env[key] = value; } });
    }
});
