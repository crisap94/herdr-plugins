// Every way the plugin starts node carries the flag that keeps node:sqlite's ExperimentalWarning out of columns and logs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const FLAG = '--disable-warning=ExperimentalWarning';

test('every node command in the manifest disables the ExperimentalWarning', () => {
    const manifest = readFileSync(new URL('../herdr-plugin.toml', import.meta.url), 'utf8');
    const commands = manifest.split('\n').filter((line) => line.startsWith('command = ["node"'));
    assert.ok(commands.length > 0, 'the manifest launches node');
    for (const command of commands) {
        assert.ok(command.startsWith(`command = ["node", "${FLAG}", `), command);
    }
});

test('the daemon is spawned with the same flag', () => {
    const cli = readFileSync(new URL('../bin/tab-recap.ts', import.meta.url), 'utf8');
    assert.match(cli, /export const QUIET = \['--disable-warning=ExperimentalWarning'\];/);
    assert.match(cli, /spawn\(process\.execPath, \[\.\.\.QUIET, /);
});
