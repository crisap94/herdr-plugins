import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '#src/daemon/config.ts';

test('a view setting outside its range falls back', () => {
    const dir = mkdtempSync(join(tmpdir(), 'recap-config-'));
    const keys = ['HERDR_PLUGIN_CONFIG_DIR', 'TAB_RECAP_WRITER_PRUNE', 'TAB_RECAP_WRITER_KEEP_NEWEST', 'TAB_RECAP_WRITER_NEXT_HOURS'] as const;
    const saved = keys.map((key) => process.env[key]);
    process.env['HERDR_PLUGIN_CONFIG_DIR'] = dir;
    try {
        keys.slice(1).forEach((key) => { delete process.env[key]; });
        assert.deepEqual(loadConfig().writerView, { kind: 'full' });
        assert.deepEqual(loadConfig().writerViewSettings, { kind: 'pruned', keepNewest: 10, nextHours: 24 });
        writeFileSync(join(dir, 'config.env'), 'TAB_RECAP_WRITER_PRUNE=on\nTAB_RECAP_WRITER_KEEP_NEWEST=51\nTAB_RECAP_WRITER_NEXT_HOURS=0\n');
        assert.deepEqual(loadConfig().writerView, { kind: 'pruned', keepNewest: 10, nextHours: 24 });
        writeFileSync(join(dir, 'config.env'), 'TAB_RECAP_WRITER_PRUNE=on\nTAB_RECAP_WRITER_KEEP_NEWEST=4\nTAB_RECAP_WRITER_NEXT_HOURS=48\n');
        assert.deepEqual(loadConfig().writerView, { kind: 'pruned', keepNewest: 4, nextHours: 48 });
        writeFileSync(join(dir, 'config.env'), 'TAB_RECAP_WRITER_PRUNE=yes\n');
        assert.deepEqual(loadConfig().writerView, { kind: 'full' });
    } finally {
        keys.forEach((key, at) => { const value = saved[at]; if (value === undefined) { delete process.env[key]; } else { process.env[key] = value; } });
        rmSync(dir, { recursive: true });
    }
});
