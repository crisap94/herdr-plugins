import { test } from 'node:test';
import { textOf } from '#src/recap/domain/text.ts';
import type { Directory } from '#src/recap/domain/directory.ts';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { databaseFile, openStoreAt } from '#src/adapters/db/database.ts';
import { apply, modelBackends, settingIds, settingsOf } from '../bin/desktop-settings-model.ts';
import { changes, draftFrom, FIELDS, initial, ROWS } from '#src/recap/application/setup-keys.ts';
import type { Draft } from '#src/recap/application/setup-keys.ts';

const models = { claude: textOf(''), codex: textOf('gpt-6-luna'), opencode: textOf(''), custom: textOf('') };
const draft: Draft = draftFrom({ backend: 'codex', models }, { locale: undefined, recapLanguage: undefined });
const byId = (id: string): ReturnType<typeof settingsOf>[number] | undefined => settingsOf(draft, {}).find((each) => each.id === id);

test('the desktop list is the terminal list: every field of every row, the model of each backend that has one', () => {
    const expected = FIELDS.flatMap((field) => (field === 'model' ? modelBackends.map((id) => `model.${id}`) : [field]));
    assert.deepEqual([...settingIds], expected);
    assert.deepEqual(settingsOf(draft, {}).map((each) => each.id), expected);
    assert.equal(ROWS.length, 19);
    assert.ok(modelBackends.length > 0);
});

test('choices list the values the terminal choice list cycles through, the current one among them', () => {
    const locale = byId('locale');
    assert.deepEqual([locale?.kind, locale?.options, locale?.value], ['choice', ['auto', 'en', 'es'], 'auto']);
    const harness = byId('harness');
    assert.equal(harness?.value, 'codex');
    assert.ok(harness.options.includes('codex') && harness.options.includes('auto'));
    assert.deepEqual(byId('gitNote')?.options, ['on', 'off']);
});

test('numbers and texts carry the value the terminal shows, and a model is its own text field', () => {
    assert.equal(byId('compactHint')?.kind, 'number');
    assert.equal(byId('recapLanguage')?.kind, 'text');
    assert.equal(byId('model.codex')?.value, 'gpt-6-luna');
    assert.equal(byId('model.codex')?.env, 'TAB_RECAP_MODEL_CODEX');
});

test('applying a value goes through the terminal keep functions and the same change set', () => {
    const applied = apply(draft, {}, new Map([['locale', 'es'], ['compactHint', '55'], ['model.codex', ' gpt-7 ']]));
    assert.deepEqual(applied.rejected, []);
    const written = changes({ ...initial(draft, {}), draft: applied.draft });
    assert.deepEqual([...written].toSorted((a, b) => a[0].localeCompare(b[0])), [['TAB_RECAP_COMPACT_HINT', '55'], ['TAB_RECAP_LOCALE', 'es'], ['TAB_RECAP_MODEL_CODEX', 'gpt-7']]);
});

test('an unknown field, a value outside the choices and a locked field are rejected, the rest still applies', () => {
    const applied = apply(draft, { gitNote: 'TAB_RECAP_GIT_NOTE' }, new Map([['nope', 'x'], ['locale', 'fr'], ['gitNote', 'off'], ['effort', 'high']]));
    assert.deepEqual(applied.rejected.map((each) => [each.id, each.why]), [['nope', 'unknown'], ['locale', 'unknown'], ['gitNote', 'locked']]);
    assert.equal(applied.draft.effort, 'high');
    assert.equal(applied.draft.gitNote, 'on');
});

const ENTRY = join(import.meta.dirname, '..', 'bin', 'tab-recap-desktop.ts');

function desktop(args: string[], home: string): { status: number | null; out: string } {
    const done = spawnSync(process.execPath, [ENTRY, ...args], {
        encoding: 'utf8', timeout: 30_000,
        env: { ...process.env, TAB_RECAP_STATE: home, HERDR_PLUGIN_STATE_DIR: '', HERDR_PLUGIN_CONFIG_DIR: home, TAB_RECAP_LOCALE: '', TAB_RECAP_RECAP_LANG: '', LANG: 'en_US.UTF-8' },
    });
    return { status: done.status, out: done.stdout };
}

function inFolder(run: (home: string) => void): void {
    const home = mkdtempSync(join(tmpdir(), 'tab-recap-settings-'));
    try {
        const owner = openStoreAt(databaseFile(home as Directory));
        if (owner.kind === 'ready') {
            owner.close();
        }
        run(home);
    } finally {
        rmSync(home, { recursive: true, force: true });
    }
}

test('the settings word prints the list as JSON with the language in effect', () => {
    inFolder((home) => {
        const done = desktop(['settings'], home);
        assert.equal(done.status, 0);
        const body = JSON.parse(done.out) as { locale: { setting: string; effective: string }; settings: { id: string }[] };
        assert.deepEqual(body.locale, { setting: 'auto', effective: 'en' });
        assert.deepEqual(body.settings.map((each) => each.id), [...settingIds]);
    });
});

test('settings set writes config.env through the terminal writer and reports the new state', () => {
    inFolder((home) => {
        writeFileSync(join(home, 'config.env'), 'TAB_RECAP_BACKEND=codex\n# kept\n');
        const done = desktop(['settings', 'set', 'locale=es', 'effort=high'], home);
        assert.equal(done.status, 0);
        const body = JSON.parse(done.out) as { locale: { setting: string; effective: string }; saved: string[]; rejected: unknown[] };
        assert.deepEqual([body.locale.setting, body.locale.effective, body.saved.toSorted((a, b) => a.localeCompare(b)), body.rejected], ['es', 'es', ['TAB_RECAP_EFFORT', 'TAB_RECAP_LOCALE'], []]);
        const file = readFileSync(join(home, 'config.env'), 'utf8');
        assert.match(file, /^TAB_RECAP_BACKEND=codex$/m);
        assert.match(file, /^# kept$/m);
        assert.match(file, /^TAB_RECAP_LOCALE=es$/m);
        assert.match(file, /^TAB_RECAP_EFFORT=high$/m);
    });
});

test('settings set with a bad word or an unknown field fails and writes nothing', () => {
    inFolder((home) => {
        assert.equal(desktop(['settings', 'set'], home).status, 2);
        assert.equal(desktop(['settings', 'set', 'novalue'], home).status, 2);
        assert.equal(desktop(['settings', 'set', 'nope=1'], home).status, 1);
        assert.throws(() => readFileSync(join(home, 'config.env'), 'utf8'));
    });
});
