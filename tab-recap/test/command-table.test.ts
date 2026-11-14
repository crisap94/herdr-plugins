import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { COMMAND_SLOTS, COMMAND_TABLE, listedWords, slotDefault, slottedCommand } from '../bin/command-table.ts';

const ROOT = join(import.meta.dirname, '..');
const BUILT_IN = 'show|compact|handoff|configure|start|startup|ensure|stop|toggle|status|column|columns|refresh|backend|eval|autocompact';

const defaults = (on: readonly string[]) => async (slot: string): Promise<boolean> => on.includes(slot);
const keys = (values: Readonly<Record<string, string>>) => (key: string): string | undefined => values[key];

function cli(args: readonly string[], settings: Readonly<Record<string, string>>): { status: number | null; out: string; err: string } {
    const home = mkdtempSync(join(tmpdir(), 'tab-recap-command-table-'));
    try {
        const done = spawnSync(process.execPath, [join(ROOT, 'bin', 'tab-recap.mjs'), ...args], {
            encoding: 'utf8',
            env: { ...process.env, HERDR_PLUGIN_CONFIG_DIR: home, TAB_RECAP_STATE: home, TAB_RECAP_LOCALE: 'en', TAB_RECAP_HOOKS: '', TAB_RECAP_VIEW_SERVER: '', ...settings },
        });
        return { status: done.status, out: done.stdout, err: done.stderr };
    } finally {
        rmSync(home, { recursive: true, force: true });
    }
}

test('the command table and the slot map name the same words, none of them a built-in word', () => {
    assert.deepEqual(Object.keys(COMMAND_TABLE).toSorted(), ['hooks', 'pane']);
    assert.deepEqual(Object.keys(COMMAND_SLOTS).toSorted(), Object.keys(COMMAND_TABLE).toSorted());
    assert.deepEqual(COMMAND_SLOTS['hooks'], { slot: 'hooks', key: 'TAB_RECAP_HOOKS' });
    assert.deepEqual(COMMAND_SLOTS['pane'], { slot: 'view', key: 'TAB_RECAP_VIEW_SERVER' });
    for (const word of Object.keys(COMMAND_TABLE)) assert.ok(!BUILT_IN.split('|').includes(word), word);
});

test('a slotted word runs its stub with the arguments after it; any other word is not slotted', async () => {
    assert.equal(slottedCommand(undefined, []), undefined);
    assert.equal(slottedCommand('status', []), undefined);
    assert.equal(slottedCommand('toString', []), undefined);
    const hooks = slottedCommand('hooks', ['install']);
    assert.ok(hooks !== undefined);
    assert.equal(typeof (await COMMAND_TABLE['pane']?.())?.run, 'function');
});

test('a word is listed while its key is on, hidden while it is off, and follows the slot default while it is unset', async () => {
    assert.deepEqual(await listedWords(keys({}), defaults([])), []);
    assert.deepEqual(await listedWords(keys({}), defaults(['hooks', 'view'])), ['hooks', 'pane']);
    assert.deepEqual(await listedWords(keys({ TAB_RECAP_HOOKS: 'on' }), defaults([])), ['hooks']);
    assert.deepEqual(await listedWords(keys({ TAB_RECAP_VIEW_SERVER: 'on' }), defaults([])), ['pane']);
    assert.deepEqual(await listedWords(keys({ TAB_RECAP_HOOKS: 'off' }), defaults(['hooks'])), []);
    assert.deepEqual(await listedWords(keys({ TAB_RECAP_HOOKS: 'yes' }), defaults([])), []);
    assert.deepEqual(await listedWords(keys({ TAB_RECAP_HOOKS: 'yes' }), defaults(['hooks'])), ['hooks']);
});

test('a slot file decides its default by its defaultOn export; a missing or broken slot file counts as off', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'tab-recap-slots-'));
    try {
        writeFileSync(join(folder, 'hooks.ts'), 'export const defaultOn = true;\n');
        writeFileSync(join(folder, 'view.ts'), 'export const defaultOn = false;\n');
        writeFileSync(join(folder, 'roll.ts'), 'export const defaultOn = "true";\n');
        writeFileSync(join(folder, 'timing.ts'), 'export const defaultOn = ;\n');
        const base = pathToFileURL(`${folder}/`);
        assert.equal(await slotDefault('hooks', base), true);
        assert.equal(await slotDefault('view', base), false);
        assert.equal(await slotDefault('roll', base), false);
        assert.equal(await slotDefault('timing', base), false);
        assert.equal(await slotDefault('telemetry', base), false);
        assert.equal(await slotDefault('no-such-slot'), false);
    } finally {
        rmSync(folder, { recursive: true, force: true });
    }
});

test('with every slot off the usage text lists the built-in words only, as before', () => {
    const done = cli(['--help'], {});
    assert.equal(done.status, 0, done.err);
    assert.equal(done.out, `USAGE: tab-recap ${BUILT_IN} [-h|--help]\n`);
});

test('the usage text lists hooks while TAB_RECAP_HOOKS is on and pane while TAB_RECAP_VIEW_SERVER is on', () => {
    assert.equal(cli(['--help'], { TAB_RECAP_HOOKS: 'on' }).out, `USAGE: tab-recap ${BUILT_IN}|hooks [-h|--help]\n`);
    assert.equal(cli(['--help'], { TAB_RECAP_VIEW_SERVER: 'on' }).out, `USAGE: tab-recap ${BUILT_IN}|pane [-h|--help]\n`);
    assert.equal(cli(['--help'], { TAB_RECAP_HOOKS: 'off' }).out, `USAGE: tab-recap ${BUILT_IN} [-h|--help]\n`);
});

test('the hooks and pane words exist while dark: each says not available and exits 3', () => {
    for (const word of ['hooks', 'pane']) {
        const done = cli([word, 'install', '--help'], {});
        assert.equal(done.status, 3, `${word}: ${done.err}`);
        assert.equal(done.err, `tab-recap: 3 — ${word}: not available\n`);
        assert.equal(done.out, '');
    }
});

test('an unknown word still exits 2 with the usage text', () => {
    const done = cli(['no-such-word'], {});
    assert.equal(done.status, 2);
    assert.match(done.err, /USAGE: tab-recap /);
});
