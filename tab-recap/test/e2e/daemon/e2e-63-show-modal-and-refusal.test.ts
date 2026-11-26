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
            entrypoint: 'column',
            plugin_id: 'tab-recap',
            pane: { agent_status: 'idle', focused: true, pane_id: 'w1:p9', revision: 1, tab_id: 'w1:t1', terminal_id: 'term-9', workspace_id: 'w1' },
        },
    });
});

after(async () => {
    await world.close();
});

test('the modal opens for the tab', { timeout: 30_000 }, async () => {
    const ran = await world.command('show');
    assert.equal(ran.code, 0, ran.stderr);
    assert.equal(ran.stdout, '');
    assert.equal(ran.stderr, '');
    assert.equal(opened().length, 1);
    const params = opened()[0]?.params as { placement: string; focus: boolean; plugin_id: string; env: Record<string, string> };
    assert.equal(params.plugin_id, 'tab-recap');
    assert.equal(params.placement, 'popup');
    assert.equal(params.focus, true);
    assert.equal(params.env['TAB_RECAP_TAB'], 'w1:t1');
    assert.equal(params.env['TAB_RECAP_MODE'], 'modal');
    assert.equal(params.env['TAB_RECAP_STATE'], world.stateDir);
});

test('a refusal from herdr exits 1 with the reason', { timeout: 30_000 }, async () => {
    world.herdr.fail(Method.PluginPaneOpen, { code: 'pane_limit', message: 'herdr will not open another pane' });
    const ran = await world.command('show');
    assert.equal(ran.code, 1);
    assert.equal(ran.stdout, '');
    assert.match(ran.stderr, /^tab-recap: 1 — the modal did not open \(.*herdr will not open another pane \[pane_limit\]\)\n$/);
    assert.equal(opened().length, 2);
});
