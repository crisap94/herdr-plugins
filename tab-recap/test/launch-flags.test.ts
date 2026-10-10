import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('every node command in the manifest is plain `node <script>`', () => {
    const manifest = readFileSync(new URL('../herdr-plugin.toml', import.meta.url), 'utf8');
    const commands = manifest.split('\n').filter((line) => line.startsWith('command = ["node"'));
    assert.ok(commands.length > 0, 'the manifest launches node');
    for (const command of commands) {
        assert.match(command, /^command = \["node", "[^"-][^"]*"/, command);
    }
});

test('the daemon is spawned without a flag and nothing mentions the warning flag', () => {
    const cli = readFileSync(new URL('../bin/tab-recap.ts', import.meta.url), 'utf8');
    assert.match(cli, /spawn\(process\.execPath, \[join\(root, 'src', 'daemon', 'launch\.mjs'\)\]/);
    assert.doesNotMatch(cli, /disable-warning/);
});
