import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { Method } from '@stateforge-labs/herdr-sdk';
import { daemonWorld, type DaemonWorld } from '../support/daemon-world.ts';

let world: DaemonWorld;

const opened = (): readonly { readonly params: unknown }[] => world.herdr.requests().filter((request) => request.method === 'plugin.pane.open');

before(async () => {
    world = await daemonWorld();
    world.herdr.reply(Method.PluginPaneOpen, {
        type: 'plugin_pane_opened',
        plugin_pane: {
            entrypoint: 'setup',
            plugin_id: 'tab-recap',
            pane: { agent_status: 'idle', focused: true, pane_id: 'w1:p9', revision: 1, tab_id: 'w1:t1', terminal_id: 'term-9', workspace_id: 'w1' },
        },
    });
});

after(async () => {
    await world.close();
});

test('configure opens the settings modal when none is open', { timeout: 30_000 }, async () => {
    const ran = await world.command('configure');
    assert.equal(ran.code, 0, ran.stderr);
    assert.equal(ran.stdout, '');
    assert.equal(ran.stderr, '');
    assert.equal(opened().length, 1);
    const params = opened()[0]?.params as { entrypoint: string; placement: string; env: Record<string, string> };
    assert.equal(params.entrypoint, 'setup');
    assert.equal(params.placement, 'popup');
    assert.equal(params.env['TAB_RECAP_TAB'], 'w1:t1');
});

test('configure says another modal is open and exits 1', { timeout: 30_000 }, async () => {
    world.herdr.fail(Method.PluginPaneOpen, { code: 'ui_busy', message: 'another modal is open' });
    const ran = await world.command('configure');
    assert.equal(ran.code, 1);
    assert.equal(ran.stdout, '');
    assert.match(ran.stderr, /^tab-recap: another herdr modal is open, so the settings cannot open now — close it and try again, or from a shell: bun \S+bin\/tab-recap\.mjs backend <auto\|claude\|codex\|opencode\|custom> \[model\]\n$/);
    assert.equal(opened().length, 2);
});

test('any other refusal is reported as a failed modal, not as busy', { timeout: 30_000 }, async () => {
    world.herdr.fail(Method.PluginPaneOpen, { code: 'pane_limit', message: 'herdr will not open another pane' });
    const ran = await world.command('configure');
    assert.equal(ran.code, 1);
    assert.match(ran.stderr, /^tab-recap: 1 — the modal did not open \(.*\[pane_limit\]\)\n$/);
    assert.doesNotMatch(ran.stderr, /another herdr modal/);
});
