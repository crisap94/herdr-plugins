// `autocompact-probe.ts` without `--dir`: the usage line, exit 2, and nothing written (a flag that is absent is not read as the next argument).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const entry = join(import.meta.dirname, '..', 'bin', 'autocompact-probe.ts');

test('the probe without --dir prints the usage, exits 2 and writes nothing', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'recap-probe-usage-'));
    try {
        const ran = spawnSync(process.execPath, [entry, '--arm', 'jev', '--rep', '1'], { cwd, encoding: 'utf8', env: { PATH: process.env['PATH'] ?? '', HOME: cwd } });
        assert.equal(ran.status, 2);
        assert.match(ran.stderr, /^usage: autocompact-probe\.ts --dir <exp002 dir>/m);
        assert.deepEqual(readdirSync(cwd), []);
    } finally {
        rmSync(cwd, { recursive: true, force: true });
    }
});
