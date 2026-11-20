import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { viewSwitchOf } from '#src/pane/view-switch.ts';

function withHome(run: (home: string) => void): void {
    const home = mkdtempSync(join(tmpdir(), 'view-switch-'));
    try {
        run(home);
    } finally {
        rmSync(home, { recursive: true, force: true });
    }
}

test('the view switch is on when neither the environment nor config.env sets it', () => {
    withHome((home) => {
        assert.equal(viewSwitchOf({ HERDR_PLUGIN_CONFIG_DIR: home }), 'on');
        assert.equal(viewSwitchOf({}, pathToFileURL(`${home}/`)), 'on');
    });
});

test('the view switch reads config.env the way the daemon does: last line wins, quotes and comments are handled', () => {
    withHome((home) => {
        writeFileSync(join(home, 'config.env'), "# TAB_RECAP_VIEW_SERVER=on\nTAB_RECAP_VIEW_SERVER=on\n  TAB_RECAP_VIEW_SERVER = 'off'\n");
        assert.equal(viewSwitchOf({ HERDR_PLUGIN_CONFIG_DIR: home }), 'off');
        assert.equal(viewSwitchOf({ HERDR_PLUGIN_CONFIG_DIR: home, TAB_RECAP_VIEW_SERVER: '' }), 'off');
        assert.equal(viewSwitchOf({ HERDR_PLUGIN_CONFIG_DIR: home, TAB_RECAP_VIEW_SERVER: 'on' }), 'on');
    });
});

test('the view switch finds config.env under the home default and lets the environment win', () => {
    withHome((home) => {
        const dir = join(home, '.config/herdr/plugins/config/tab-recap');
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'config.env'), 'TAB_RECAP_VIEW_SERVER=off\n');
        assert.equal(viewSwitchOf({}, pathToFileURL(`${home}/`)), 'off');
        assert.equal(viewSwitchOf({ TAB_RECAP_VIEW_SERVER: 'on' }, pathToFileURL(`${home}/`)), 'on');
        assert.equal(viewSwitchOf({ TAB_RECAP_VIEW_SERVER: 'off' }), 'off');
    });
});
