import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ENTRY = join(import.meta.dirname, '..', 'bin', 'tab-recap-desktop.ts');

function desktop(args: string[], env: Record<string, string>): { status: number | null; out: string; err: string } {
    const done = spawnSync(process.execPath, [ENTRY, ...args], {
        encoding: 'utf8', timeout: 20_000,
        env: { ...process.env, TAB_RECAP_STATE: '', HERDR_PLUGIN_STATE_DIR: '', TAB_RECAP_LOCALE: 'en', ...env },
    });
    return { status: done.status, out: done.stdout, err: done.stderr };
}

function inFolder(run: (home: string) => void): void {
    const home = mkdtempSync(join(tmpdir(), 'tab-recap-desktop-'));
    try {
        run(home);
    } finally {
        rmSync(home, { recursive: true, force: true });
    }
}

test('the desktop entry keeps its own state folder beside the terminal one', () => {
    inFolder((home) => {
        const done = desktop(['status'], { HERDR_PLUGIN_STATE_DIR: home, HERDR_PLUGIN_CONFIG_DIR: home });
        assert.equal(done.status, 0);
        assert.match(done.out, new RegExp(`state\\s+${join(home, 'desktop').replaceAll('.', '\\.')}`));
        assert.match(done.out, /not running/);
    });
});

test('an explicit TAB_RECAP_STATE wins over the desktop default', () => {
    inFolder((home) => {
        const done = desktop(['status'], { TAB_RECAP_STATE: home, HERDR_PLUGIN_CONFIG_DIR: home });
        assert.match(done.out, new RegExp(`state\\s+${home.replaceAll('.', '\\.')}\\n?$`));
    });
});

test('an unknown word or a missing tab is a usage error, exit 2', () => {
    inFolder((home) => {
        const env = { TAB_RECAP_STATE: home, HERDR_PLUGIN_CONFIG_DIR: home };
        assert.equal(desktop(['nope'], env).status, 2);
        assert.equal(desktop([], env).status, 2);
        assert.equal(desktop(['refresh'], env).status, 2);
        assert.equal(desktop(['doc'], env).status, 2);
    });
});

test('doc for a tab without a recap or a view fails with exit 1 and prints nothing', () => {
    inFolder((home) => {
        const done = desktop(['doc', 't-none'], { TAB_RECAP_STATE: home, HERDR_PLUGIN_CONFIG_DIR: home });
        assert.equal(done.status, 1);
        assert.equal(done.out, '');
        assert.match(done.err, /no recap for t-none/);
    });
});

test('refresh queues a request for the tab and says so', () => {
    inFolder((home) => {
        const done = desktop(['refresh', 't-one'], { TAB_RECAP_STATE: home, HERDR_PLUGIN_CONFIG_DIR: home });
        assert.equal(done.status, 0);
        assert.match(done.out, /t-one/);
    });
});

test('stop switches the daemon off and ensure then leaves it off', () => {
    inFolder((home) => {
        const env = { TAB_RECAP_STATE: home, HERDR_PLUGIN_CONFIG_DIR: home };
        assert.equal(desktop(['stop'], env).status, 0);
        assert.equal(desktop(['ensure'], env).status, 0);
        assert.match(desktop(['status'], env).out, /not running \(switched off\)/);
    });
});
