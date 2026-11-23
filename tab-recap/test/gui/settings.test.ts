import { test } from 'node:test';
import { textOf } from '#src/recap/domain/text.ts';
import assert from 'node:assert/strict';
import { apply, rawSettingsFrom, settingIds, settingsOf } from '../../bin/desktop-settings-model.ts';
import { draftFrom, type Draft } from '#src/recap/application/setup-keys.ts';
import { fleet } from './support/fixture.ts';
import { reset, world } from './support/herdr.ts';
import { mount, type Mounted } from './support/mount.ts';
import { settle } from './support/register.ts';
import { byId, click, hasId, idsOf, inputState, press, text } from './support/tree.ts';

const models = { claude: textOf(''), codex: textOf('gpt-6-luna'), opencode: textOf(''), custom: textOf('') };
let draft: Draft = draftFrom({ backend: 'codex', models }, rawSettingsFrom(() => undefined));
let failing = false;

const body = (): string => JSON.stringify({ locale: { setting: draft.locale, effective: draft.locale === 'auto' ? 'en' : draft.locale }, settings: settingsOf(draft, {}) });

function daemon(): void {
    world.execReply = (_command, argv): { code: number; stdout: string; stderr: string } | null => {
        if (argv[0] !== 'settings') {
            return null;
        }
        if (failing) {
            return { code: 1, stdout: '', stderr: 'boom' };
        }
        if (argv[1] === 'set') {
            draft = apply(draft, {}, new Map(argv.slice(2).map((word): [string, string] => [word.slice(0, word.indexOf('=')), word.slice(word.indexOf('=') + 1)]))).draft;
        }
        return { code: 0, stdout: body(), stderr: '' };
    };
}

const sets = (): string[][] => world.execLog.filter((call) => call.argv[0] === 'settings' && call.argv[1] === 'set').map((call) => call.argv.slice(2));

async function opened(): Promise<Mounted> {
    const view = await mount({ role: 'fleet' });
    click(byId(view.render(), 'gear'), view.cx);
    await settle();
    return view;
}

test.beforeEach(() => {
    reset();
    fleet();
    failing = false;
    draft = draftFrom({ backend: 'codex', models }, rawSettingsFrom(() => undefined));
    daemon();
});

test('the gear opens the settings page, which loads the current values', async () => {
    const view = await opened();
    const tree = view.render();
    assert.ok(hasId(tree, 'settings'));
    assert.ok(!hasId(tree, 'fleet-list'));
    assert.match(text(tree), /Interface language/);
    assert.match(text(tree), /GENERAL/);
    assert.ok(world.execLog.some((call) => call.argv[0] === 'settings' && call.argv.length === 1));
});

test('every setting the terminal pane offers is a row of a named group, none falls into Other', async () => {
    const view = await opened();
    const tree = view.render();
    assert.deepEqual(idsOf(tree, 'setting-').map((id) => id.slice('setting-'.length)).toSorted((a, b) => a.localeCompare(b)), [...settingIds].toSorted((a, b) => a.localeCompare(b)));
    assert.doesNotMatch(text(tree), /\bOTHER\b/);
});

test('a toggle saves through the settings command, with the flipped value', async () => {
    const view = await opened();
    click(byId(view.render(), 'set-gitNote'), view.cx);
    await settle();
    assert.deepEqual(sets(), [['gitNote=off']]);
    assert.equal(draft.gitNote, 'off');
    assert.match(text(view.render()), /Saved/);
});

test('a select saves the picked option', async () => {
    const view = await opened();
    click(byId(view.render(), 'set-effort-high'), view.cx);
    await settle();
    assert.deepEqual(sets(), [['effort=high']]);
});

test('a text field saves when it is submitted, a number field when it loses focus', async () => {
    const view = await opened();
    const language = inputState(view.render(), 'set-recapLanguage');
    language.set_value('es');
    language.fire('submit', view.cx);
    await settle();
    const hint = inputState(view.render(), 'set-compactHint');
    hint.set_value('55');
    hint.fire('blur', view.cx);
    await settle();
    assert.deepEqual(sets(), [['recapLanguage=es'], ['compactHint=55']]);
    assert.equal(inputState(view.render(), 'set-compactHint').value(), '55');
});

test('a field left as it was saves nothing', async () => {
    const view = await opened();
    inputState(view.render(), 'set-recapLanguage').fire('blur', view.cx);
    await settle();
    assert.deepEqual(sets(), []);
});

test('choosing the interface language switches the whole mod live', async () => {
    const view = await opened();
    assert.match(text(view.render()), /Interface language/);
    click(byId(view.render(), 'set-locale-es'), view.cx);
    await settle();
    assert.deepEqual(sets(), [['locale=es']]);
    assert.match(text(view.render()), /Idioma de la interfaz/);
    assert.match(text(view.render()), /Ajustes/);
    assert.doesNotMatch(text(view.render()), /Interface language/);
    click(byId(view.render(), 'back'), view.cx);
    assert.match(text(view.render()), /Actualizar todo/);
});

test('Escape leaves the page and Enter does nothing there but commit a field', async () => {
    const view = await opened();
    press(view.render(), 'enter', view.cx);
    assert.ok(hasId(view.render(), 'settings'));
    press(view.render(), 'escape', view.cx);
    assert.ok(hasId(view.render(), 'fleet-list'));
});

test('when the command fails the page says so and offers to try again', async () => {
    failing = true;
    const view = await opened();
    assert.match(text(view.render()), /could not be read/);
    failing = false;
    click(byId(view.render(), 'settings-retry'), view.cx);
    await settle();
    assert.ok(hasId(view.render(), 'setting-locale'));
});

test('a save that fails says so and keeps the page', async () => {
    const view = await opened();
    failing = true;
    click(byId(view.render(), 'set-gitNote'), view.cx);
    await settle();
    assert.match(text(view.render()), /Could not save/);
    assert.ok(hasId(view.render(), 'setting-gitNote'));
});

test('a setting fixed by the environment is shown with its reason and cannot be changed', async () => {
    const locked = settingsOf(draft, { gitNote: 'TAB_RECAP_GIT_NOTE' });
    world.execReply = (): { code: number; stdout: string; stderr: string } => ({ code: 0, stdout: JSON.stringify({ locale: { setting: 'auto', effective: 'en' }, settings: locked }), stderr: '' });
    const view = await opened();
    assert.match(text(view.render()), /Set by TAB_RECAP_GIT_NOTE in the environment/);
    assert.throws(() => click(byId(view.render(), 'set-gitNote'), view.cx));
});
