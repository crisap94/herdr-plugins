// The settings of the pipeline and the reconciliation, and the enumeration's job on a harness.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { enumeratorFor } from '#src/daemon/backends.ts';
import { loadConfig } from '#src/daemon/config.ts';

function withConfig(lines: string, body: () => void): void {
    const keys = ['HERDR_PLUGIN_CONFIG_DIR', 'TAB_RECAP_PIPELINE', 'TAB_RECAP_RECONCILE_EVERY', 'TAB_RECAP_BACKEND'] as const;
    const saved = keys.map((key) => process.env[key]);
    const dir = mkdtempSync(join(tmpdir(), 'recap-config-'));
    try {
        for (const key of keys) {
            delete process.env[key];
        }
        process.env['HERDR_PLUGIN_CONFIG_DIR'] = dir;
        writeFileSync(join(dir, 'config.env'), lines);
        body();
    } finally {
        keys.forEach((key, at) => { if (saved[at] === undefined) { delete process.env[key]; } else { process.env[key] = saved[at]; } });
        rmSync(dir, { recursive: true });
    }
}

test('TAB_RECAP_PIPELINE names the steps of a run (full unless set; nonsense is the default); TAB_RECAP_RECONCILE_EVERY the turns between two reconciliations (8; a whole number of 1 or more)', () => {
    withConfig('', () => {
        assert.deepEqual([loadConfig().pipeline, loadConfig().reconcileEvery], ['full', 8]);
    });
    withConfig('TAB_RECAP_PIPELINE=Enumerate+Gates\nTAB_RECAP_RECONCILE_EVERY=3\n', () => {
        assert.deepEqual([loadConfig().pipeline, loadConfig().reconcileEvery], ['enumerate+gates', 3]);
    });
    withConfig('TAB_RECAP_PIPELINE=fast\nTAB_RECAP_RECONCILE_EVERY=0\n', () => {
        assert.deepEqual([loadConfig().pipeline, loadConfig().reconcileEvery], ['full', 8]);
    });
    withConfig('TAB_RECAP_RECONCILE_EVERY=2.7\n', () => {
        assert.equal(loadConfig().reconcileEvery, 2);
    });
});

test('the enumeration is the writer\'s harness at low effort; none when no harness is installed or the writer is a custom command', () => {
    withConfig('TAB_RECAP_BACKEND=claude\nTAB_RECAP_MODEL_CLAUDE=sonnet\nTAB_RECAP_EFFORT=high\n', () => {
        const config = loadConfig();
        const made = enumeratorFor(config, ['claude', 'codex'], '/tmp/none');
        assert.ok(made !== null && made.job === 'claude · sonnet · low', made?.job);
    });
    withConfig('TAB_RECAP_BACKEND=auto\n', () => {
        assert.equal(enumeratorFor(loadConfig(), [], '/tmp/none'), null);
    });
    withConfig('TAB_RECAP_BACKEND=custom\nTAB_RECAP_CUSTOM_CMD=cat\n', () => {
        assert.equal(enumeratorFor(loadConfig(), ['custom'], '/tmp/none'), null);
    });
});
