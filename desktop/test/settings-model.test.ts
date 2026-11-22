import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MESSAGES } from 'herdr-desktop-mods/tab-recap/catalog';
import { controlOf, flipped, GROUPS, groupOf, hintOf, KNOWN_IDS, labelOf, layoutOf, OTHER_GROUP, optionLabel } from 'herdr-desktop-mods/tab-recap/settings-model';
import type { Messages, Setting } from '../types/tab-recap-settings-model.d.ts';

const setting = (id: string, kind: string, value: string, options: readonly string[] = []): Setting => ({ id, env: id.toUpperCase(), kind, value, options, locked: false });

const messages = (lang: string): Messages => MESSAGES[lang] as unknown as Messages;

test('controls follow the kind: on/off is a toggle, other choices a select, numbers and texts a field', () => {
    assert.equal(controlOf(setting('gitNote', 'choice', 'on', ['on', 'off'])), 'toggle');
    assert.equal(controlOf(setting('effort', 'choice', 'low', ['low', 'medium', 'high', 'default'])), 'select');
    assert.equal(controlOf(setting('compactHint', 'number', '40')), 'number');
    assert.equal(controlOf(setting('recapLanguage', 'text', 'ui')), 'text');
});

test('a toggle flips between on and off', () => {
    assert.equal(flipped(setting('gitNote', 'choice', 'on', ['on', 'off'])), 'off');
    assert.equal(flipped(setting('gitNote', 'choice', 'off', ['on', 'off'])), 'on');
});

test('the layout groups every setting once, models under the recap writer, unknown ones under Other', () => {
    const all = [...KNOWN_IDS, 'model.claude', 'model.codex', 'brandNew'].map((id) => setting(id, 'text', ''));
    const layout = layoutOf(all);
    assert.equal(layout.flatMap((group) => group.items).length, all.length);
    assert.equal(groupOf('model.opencode'), 'recap');
    assert.equal(groupOf('brandNew'), OTHER_GROUP);
    assert.deepEqual(layout.find((group) => group.key === 'recap')?.items.map((item) => item.id), ['harness', 'model.claude', 'model.codex', 'effort']);
    assert.equal(layout.at(-1)?.key, OTHER_GROUP);
});

test('empty groups are left out', () => {
    assert.deepEqual(layoutOf([setting('locale', 'choice', 'auto', ['auto'])]).map((group) => group.key), ['general']);
});

test('every group and every known setting has a label and a hint in both languages', () => {
    for (const lang of ['en', 'es']) {
        const m = messages(lang);
        const groups = (MESSAGES[lang] as unknown as { settingGroups: Record<string, string> }).settingGroups;
        for (const group of [...GROUPS.map((each) => each.key), OTHER_GROUP]) {
            assert.ok(groups[group], `${lang} group ${group}`);
        }
        for (const id of KNOWN_IDS) {
            assert.notEqual(labelOf(m, id), id, `${lang} label ${id}`);
        }
        for (const id of KNOWN_IDS.filter((each) => !/Model$|Effort$/.test(each))) {
            assert.ok(hintOf(m, id), `${lang} hint ${id}`);
        }
        assert.match(labelOf(m, 'model.codex'), /codex/);
    }
});

test('option labels are words in the language, the system choice for the interface, the raw value when unknown', () => {
    const locale = setting('locale', 'choice', 'auto', ['auto', 'en', 'es']);
    assert.equal(optionLabel(messages('en'), locale, 'auto'), 'Auto (system)');
    assert.equal(optionLabel(messages('es'), locale, 'es'), 'Español');
    assert.equal(optionLabel(messages('es'), setting('harness', 'choice', 'codex', ['codex']), 'codex'), 'codex');
    assert.equal(optionLabel(messages('es'), setting('gitNote', 'choice', 'on', ['on', 'off']), 'on'), 'Sí');
});
