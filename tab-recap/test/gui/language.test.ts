import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fleet } from './support/fixture.ts';
import { reset, world } from './support/herdr.ts';
import { mount } from './support/mount.ts';
import { settle } from './support/register.ts';
import { text } from './support/tree.ts';

const answer = (setting: string): void => {
    world.execReply = (_command, argv): { code: number; stdout: string; stderr: string } | null => (argv[0] === 'settings'
        ? { code: 0, stdout: JSON.stringify({ locale: { setting, effective: setting === 'auto' ? 'en' : setting }, settings: [] }), stderr: '' }
        : null);
};

test.beforeEach(() => { reset(); fleet(); });

test('with no language anywhere the mod is English', async () => {
    const view = await mount({ role: 'fleet' });
    await settle();
    assert.match(text(view.render()), /Refresh all/);
});

test('tab-recap set to es makes the mod Spanish whatever the system says', async () => {
    world.env.set('LANG', 'en_US.UTF-8');
    answer('es');
    const view = await mount({ role: 'fleet' });
    await settle();
    assert.match(text(view.render()), /Actualizar todo/);
    assert.doesNotMatch(text(view.render()), /Refresh all/);
});

test('tab-recap set to en keeps English on a Spanish system', async () => {
    world.env.set('LANG', 'es_ES.UTF-8');
    answer('en');
    const view = await mount({ role: 'fleet' });
    await settle();
    assert.match(text(view.render()), /Refresh all/);
});

test('auto follows a system language starting with es', async () => {
    world.env.set('LANG', 'es_CO.UTF-8');
    answer('auto');
    const view = await mount({ role: 'fleet' });
    await settle();
    assert.match(text(view.render()), /Actualizar todo/);
});

test('auto on an English or unknown system stays English', async () => {
    world.env.set('LANG', 'fr_FR.UTF-8');
    answer('auto');
    const view = await mount({ role: 'fleet' });
    await settle();
    assert.match(text(view.render()), /Refresh all/);
});

test('when the command is not installed the system language still decides', async () => {
    world.env.set('LANG', 'es_ES.UTF-8');
    const view = await mount({ role: 'chip' });
    await settle();
    assert.match(text(view.render()), /trabajando/);
});
