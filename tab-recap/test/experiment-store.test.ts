import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { storeAt } from '#src/adapters/experiment/legacy.ts';

function inTempDir(body: (dir: string) => void): void {
    const dir = mkdtempSync(join(tmpdir(), 'recap-experiment-store-'));
    try {
        body(dir);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

test('the experiment store refuses the live store: the same path, or a link to it', () => {
    inTempDir((dir) => {
        const live = join(dir, 'tab-recap.db');
        writeFileSync(live, '');
        assert.throws(() => storeAt(live, live), /refusing to open the plugin's live store/);
        const link = join(dir, 'copy-link.db');
        symlinkSync(live, link);
        assert.throws(() => storeAt(link, live), /refusing to open the plugin's live store/);
    });
});

test('the experiment store takes the live store from the state dir, as the CLI does', () => {
    inTempDir((dir) => {
        const was = process.env['TAB_RECAP_STATE'];
        process.env['TAB_RECAP_STATE'] = dir;
        try {
            assert.throws(() => storeAt(join(dir, 'tab-recap.db')), /refusing to open the plugin's live store/);
        } finally {
            if (was === undefined) { delete process.env['TAB_RECAP_STATE']; } else { process.env['TAB_RECAP_STATE'] = was; }
        }
    });
});

test('the experiment store opens any other path (a copy is not refused)', () => {
    inTempDir((dir) => {
        const live = join(dir, 'tab-recap.db');
        const copy = join(dir, 'copy.db');
        writeFileSync(copy, '');
        assert.throws(() => storeAt(copy, live), (error: unknown) => !(error instanceof Error && /live store/.test(error.message)));
    });
});
