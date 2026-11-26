import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
const MODEL = join(import.meta.dirname, '..', 'support', 'fake-model.sh');
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { visibleLength } from '@stateforge-labs/recap-view/unstable/wrap.ts';
import { configText, prepareStateStore, seedConfig, withWorld, type Pane, type ViewWorld, viewWorld } from '../support/view-world.ts';
import { NOW, VERSION } from '../support/view-seeds.ts';

const START = '# my notes\nTAB_RECAP_BACKEND=codex\n\nTAB_RECAP_MODEL_CODEX=gpt-6-luna\n# keep me\nTAB_RECAP_GLOW=450\n';
const ESC = String.fromCodePoint(0x1b);

const inWorld = <T>(use: (world: ViewWorld) => Promise<T>): Promise<T> => withWorld({ now: NOW, version: VERSION, agents: ['claude', 'codex'] }, use);

async function opened(world: ViewWorld, cols: number, env: Readonly<Record<string, string>> = {}): Promise<Pane> {
    const pane = await world.settings({ cols, rows: 60, env });
    await pane.painted((screen) => /● claude/.test(screen.text), 'the settings found the agents');
    return pane;
}

async function typed(pane: Pane, keys: readonly string[]): Promise<void> {
    for (const key of keys) {
        await pane.press(key);
    }
}

const text = (pane: Pane): string => pane.screen()?.text ?? '';

let world: ViewWorld;
let pane: Pane;

before(async () => {
    world = await viewWorld({ now: NOW, version: VERSION, agents: ['claude', 'codex'] });
    seedConfig(world, START);
    pane = await opened(world, 100);
});

after(async () => {
    await pane.close();
    await world.close();
});

test('the harness list marks the current harness ✓, the available ones ● and the missing ones ○, and says what auto means', { timeout: 30_000 }, () => {
    const shown = text(pane);
    assert.match(shown, /✓ codex/);
    assert.match(shown, /● claude/);
    assert.match(shown, /○ opencode/);
    assert.match(shown, /auto — the first one found: claude → codex → opencode/);
});

test('the Models group has a heading and one row per job: harness · model · effort, the focused part bracketed', { timeout: 30_000 }, async () => {
    const shown = text(pane);
    assert.match(shown, /Models — harness · model · effort/);
    assert.match(shown, /Recap writer\s+\[codex\] · gpt-6-luna · medium/);
    assert.match(shown, /Compact brief\s+as the recap writer · the recap writer's model · high/);
    await typed(pane, ['j', 'l']);
    const second = await pane.painted((screen) => /Compact brief\s+as the recap writer · \[the recap writer's model\] · high/.test(screen.text), 'the second part is focused');
    assert.match(second.text, /writes what the agent keeps when it is compacted/, 'the focused job explains itself');
    await typed(pane, ['k', 'h']);
    await pane.painted((screen) => /Recap writer\s+\[codex\]/.test(screen.text), 'back on the first row and part');
});

test('typing q, s or t while editing a text row is text, not a command: nothing closes, saves or tests, and Esc leaves the file as it was', { timeout: 30_000 }, async () => {
    await typed(pane, ['l', '\r', 'q', 's', 't']);
    await pane.painted((screen) => screen.text.includes('[gpt-6-lunaqst█]'), 'the keys went into the text');
    assert.equal(configText(world), START, 'nothing was written');
    await pane.press(ESC);
    await pane.painted((screen) => /Recap writer\s+codex · \[gpt-6-luna\] · medium/.test(screen.text), 'Esc cancelled the edit');
    assert.equal(configText(world), START);
});

test('edit a model and save: config.env holds exactly the changed row and keeps every comment and other line', { timeout: 30_000 }, async () => {
    await typed(pane, ['\r', '\u0015', 'g', 'p', 't', '-', '7', '\r']);
    await pane.painted((screen) => /Recap writer\s+codex · \[gpt-7\] · medium/.test(screen.text), 'the model reads gpt-7');
    assert.equal(configText(world), START, 'nothing is written before s');
    await pane.press('s');
    await pane.painted((screen) => screen.text.includes('saved — applies to the next recap'), 'the save is acknowledged');
    assert.equal(configText(world), '# my notes\nTAB_RECAP_BACKEND=codex\n\nTAB_RECAP_MODEL_CODEX=gpt-7\n# keep me\nTAB_RECAP_GLOW=450\n');
});

test('s with nothing changed says there is nothing to save and writes nothing', { timeout: 30_000 }, async () => {
    const kept = configText(world);
    await pane.press('s');
    await pane.painted((screen) => screen.text.includes('nothing to save'), 'nothing to save');
    assert.equal(configText(world), kept);
});

test('a changed row left unsaved asks once; a second q discards it, closes the settings and writes nothing', { timeout: 30_000 }, async () => {
    const kept = configText(world);
    await typed(pane, ['j', 'j', 'j', 'j', 'j']);
    await typed(pane, ['\r', 'j', '\r']);
    await pane.painted((screen) => /Git note\s+off/.test(screen.text), 'the git note row reads off');
    await pane.press('q');
    await pane.painted((screen) => screen.text.includes('unsaved changes — s save · q again to discard'), 'the unsaved question');
    await pane.press('q');
    assert.equal(await pane.exited(), 0);
    assert.equal(configText(world), kept, 'cancel writes nothing');
});

test('a row an environment variable sets is read-only: it names the variable, cannot be edited, and is never written while another row is saved', { timeout: 30_000 }, async () => {
    await inWorld(async (locked) => {
        seedConfig(locked, '# mine\nTAB_RECAP_HERDR_EVENTS=off\nTAB_RECAP_GLOW=450\n');
        const settings = await opened(locked, 100, { TAB_RECAP_HERDR_EVENTS: 'on' });
        try {
            assert.match(text(settings), /read-only: TAB_RECAP_HERDR_EVENTS is set in the environment/);
            await typed(settings, Array.from({ length: 17 }, () => 'j'));
            await settings.press('\r');
            await settings.painted((screen) => screen.text.includes('read-only'), 'a locked row stays as it was');
            assert.doesNotMatch(text(settings), /\[on\]|▸ .*choose/);
            await typed(settings, ['j', '\r', 'j', '\r', 's']);
            await settings.painted((screen) => screen.text.includes('saved — applies to the next recap'), 'the other row was saved');
            const written = configText(locked);
            assert.match(written, /^# mine\nTAB_RECAP_HERDR_EVENTS=off\nTAB_RECAP_GLOW=450\nTAB_RECAP_TELEMETRY_TAGS=on\n$/, 'only the changed row was added; the locked row kept its file value');
        } finally {
            await settings.close();
        }
    });
});

test('a locked model row stays out of the file even when the harness moves: only the harness is written', { timeout: 30_000 }, async () => {
    await inWorld(async (locked) => {
        seedConfig(locked, '# mine\nTAB_RECAP_BACKEND=codex\nTAB_RECAP_MODEL_CODEX=gpt-6-luna\n');
        const settings = await opened(locked, 100, { TAB_RECAP_MODEL: 'env-model' });
        try {
            await typed(settings, ['l', '\r']);
            await settings.painted((screen) => screen.text.includes('read-only: TAB_RECAP_MODEL'), 'the model part is read-only');
            await typed(settings, ['h', '\r', 'k', '\r']);
            await settings.painted((screen) => /Recap writer\s+\[?claude\]? ·/.test(screen.text), 'the harness reads claude');
            await settings.press('s');
            await settings.painted((screen) => screen.text.includes('saved — applies to the next recap'), 'saved');
            const written = configText(locked);
            assert.match(written, /^# mine\nTAB_RECAP_BACKEND=claude\nTAB_RECAP_MODEL_CODEX=gpt-6-luna\n$/, 'the harness changed and no model key moved');
            assert.doesNotMatch(written, /env-model/);
        } finally {
            await settings.close();
        }
    });
});

test('an unsafe value typed into the recap language is cleaned, and control keys are refused: the file gains exactly one tidy line', { timeout: 30_000 }, async () => {
    await inWorld(async (unsafe) => {
        seedConfig(unsafe, '# mine\n');
        prepareStateStore(unsafe);
        const settings = await opened(unsafe, 100);
        try {
            await typed(settings, ['j', 'j', 'j', '\r', '\u0015']);
            await typed(settings, [...Array.from('Zz=1;$(rm)'), '\u0007', '\n', `${ESC}[Z`, ...Array.from(' TAB_RECAP_GLOW=9')]);
            await settings.painted((screen) => screen.text.includes('Zz=1;$(rm) TAB_RECAP_GLOW=9█'), 'the control keys were not typed');
            await settings.press('\r');
            await settings.painted((screen) => /Recap language\s+Zz rm TAB/.test(screen.text), 'the value was cleaned to letters, spaces and hyphens, three words at most');
            await settings.press('s');
            await settings.painted((screen) => screen.text.includes("every tab's recap is being rewritten"), 'saved');
            assert.equal(configText(unsafe), '# mine\nTAB_RECAP_RECAP_LANG=Zz rm TAB\n');
        } finally {
            await settings.close();
        }
    });
});

test('the autocompact decider offers jev, never shows the key, and never writes it: the seeded key stays where it was', { timeout: 30_000 }, async () => {
    await inWorld(async (decider) => {
        const key = join(decider.childEnv()['HOME'] ?? '', '.config');
        mkdirSync(key, { recursive: true });
        writeFileSync(join(key, 'typesafe-api-key'), 'SENTINEL-file-key\n');
        seedConfig(decider, '# mine\nTAB_RECAP_JEV_KEY=SENTINEL-config-key\n');
        const settings = await opened(decider, 140);
        try {
            const rows = await settings.painted((screen) => /Autocompact decider\s+as the recap writer/.test(screen.text), 'the decider row');
            assert.doesNotMatch(rows.text, /Bearer|sk-|SENTINEL/u);
            await typed(settings, [...Array.from({ length: 16 }, () => 'j'), '\r']);
            const choosing = await settings.painted((screen) => screen.text.includes('jev — the TypeSafe API; the key is read from the environment or ~/.config/typesafe-api-key, never shown here'), 'jev is among the choices');
            assert.doesNotMatch(choosing.text, /Bearer|sk-|SENTINEL/u);
            await typed(settings, [...Array.from({ length: 6 }, () => 'j'), '\r', 's']);
            const done = await settings.painted((screen) => screen.text.includes('saved — applies to the next recap'), 'saved');
            assert.doesNotMatch(done.text, /Bearer|sk-|SENTINEL/u);
            assert.equal(configText(decider), '# mine\nTAB_RECAP_JEV_KEY=SENTINEL-config-key\nTAB_RECAP_AUTOCOMPACT_BY=jev\n');
        } finally {
            await settings.close();
        }
    });
});

test('a save into a folder that does not exist yet creates config.env there', { timeout: 30_000 }, async () => {
    await inWorld(async (fresh) => {
        const folder = join(fresh.configDir, 'new', 'deeper');
        const settings = await opened(fresh, 100, { HERDR_PLUGIN_CONFIG_DIR: folder });
        try {
            await typed(settings, ['j', 'j', 'j', 'j', 'j', '\r', 'j', '\r', 's']);
            await settings.painted((screen) => screen.text.includes('saved — applies to the next recap'), 'saved');
            assert.equal(readFileSync(join(folder, 'config.env'), 'utf8'), 'TAB_RECAP_GIT_NOTE=off\n');
        } finally {
            await settings.close();
        }
    });
});

test('a language change is saved under its key and asks for every recap to be rewritten', { timeout: 30_000 }, async () => {
    await inWorld(async (language) => {
        seedConfig(language, '# mine\n');
        prepareStateStore(language);
        const settings = await opened(language, 100);
        try {
            assert.match(text(settings), /Recap language\s+same as interface \(English\)/);
            await typed(settings, ['j', 'j', 'j', '\r', '\u0015', 'e', 's', '\r']);
            await settings.painted((screen) => /Recap language\s+Spanish/.test(screen.text), 'the language reads Spanish');
            await settings.press('s');
            await settings.painted((screen) => screen.text.includes("every tab's recap is being rewritten"), 'a rewrite is asked');
            assert.equal(configText(language), '# mine\nTAB_RECAP_RECAP_LANG=es\n');
        } finally {
            await settings.close();
        }
    });
});

test('the row groups are painted in English: git note, compaction rows, judge, autocompact rows and the telemetry choices', { timeout: 30_000 }, async () => {
    await inWorld(async (groups) => {
        const settings = await opened(groups, 120);
        try {
            const shown = text(settings);
            assert.match(shown, /Git note\s+on — branch/);
            assert.match(shown, /Compact\s+focused/);
            assert.match(shown, /Compact hint\s+40%/);
            assert.match(shown, /Context window\s+found at runtime/);
            assert.match(shown, /Recap judge\s+as the recap writer · the recap writer's model · medium/);
            assert.match(shown, /Autocompact\s+shadow — decides and records, never compacts/);
            assert.match(shown, /Autocompact from\s+10%/);
            assert.match(shown, /Autocompact decider\s+as the recap writer · the recap writer's model · low/);
            await typed(settings, Array.from({ length: 18 }, () => 'j'));
            await typed(settings, ['\r']);
            const choices = await settings.painted((screen) => screen.text.includes('off — do not add a job attribute') && screen.text.includes('on — add the harness.job resource attribute'), 'the telemetry choices');
            assert.ok(choices.text.includes('Job telemetry tags'));
        } finally {
            await settings.close();
        }
    });
});

const LANGUAGE_ROWS = [
    ['ui', 'en', /Recap language\s+same as interface \(English\)/],
    ['ui', 'es', /Idioma del resumen\s+igual que la interfaz \(español\)/],
    ['en', 'en', /Recap language\s+English/],
    ['es', 'en', /Recap language\s+Spanish/],
    ['en', 'es', /Idioma del resumen\s+inglés/],
    ['es', 'es', /Idioma del resumen\s+español/],
    ['Português', 'es', /Idioma del resumen\s+Português/],
] as const;

test('the recap language row says what the stored value means, in the interface language', { timeout: 60_000 }, async () => {
    for (const [stored, locale, expected] of LANGUAGE_ROWS) {
        await inWorld(async (row) => {
            seedConfig(row, `TAB_RECAP_LOCALE=${locale}\nTAB_RECAP_RECAP_LANG=${stored}\n`);
            const settings = await opened(row, 120);
            try {
                assert.match(text(settings), expected, `${stored} in ${locale}`);
            } finally {
                await settings.close();
            }
        });
    }
});

test('the telemetry row names its environment variable when it is locked', { timeout: 30_000 }, async () => {
    await inWorld(async (locked) => {
        const settings = await opened(locked, 120, { TAB_RECAP_TELEMETRY_TAGS: 'on' });
        try {
            await typed(settings, Array.from({ length: 18 }, () => 'j'));
            assert.match(text(settings), /read-only: TAB_RECAP_TELEMETRY_TAGS/);
        } finally {
            await settings.close();
        }
    });
});

test('the same screen in Spanish: rows, legend, hints and the locked row', { timeout: 30_000 }, async () => {
    await inWorld(async (spanish) => {
        seedConfig(spanish, 'TAB_RECAP_LOCALE=es\n');
        const settings = await opened(spanish, 120, { TAB_RECAP_HERDR_EVENTS: 'on' });
        try {
            const shown = text(settings);
            for (const expected of ['ajustes', 'Redactor del resumen', 'Idioma del resumen', 'disponible', 'no está en el PATH', 'solo lectura: TAB_RECAP_HERDR_EVENTS está definida en el entorno', 'Nota de git', 'Modelos — agente · modelo · esfuerzo']) {
                assert.ok(shown.includes(expected), expected);
            }
            assert.match(shown, /Guion de compactar\s+como el redactor · el modelo del redactor · high/);
            assert.match(shown, /Aviso de compactar\s+40%/);
            assert.match(shown, /Ventana de contexto\s+se detecta/);
            assert.match(shown, /Idioma del resumen\s+igual que la interfaz \(español\)/);
            assert.match(settings.screen()?.plain.at(-1) ?? '', /guardar/);
        } finally {
            await settings.close();
        }
    });
});

test('t runs the recap writer once on a fake model and says it works, in both languages', { timeout: 30_000 }, async () => {
    for (const [locale, expected] of [['en', /✓ works — \d+\.\d s/], ['es', /✓ funciona — \d+\.\d s/]] as const) {
        await inWorld(async (tested) => {
            seedConfig(tested, `TAB_RECAP_LOCALE=${locale}\nTAB_RECAP_BACKEND=custom\nTAB_RECAP_CUSTOM_CMD=${MODEL}\n`);
            const settings = await opened(tested, 100);
            try {
                await settings.press('t');
                await settings.painted((screen) => expected.test(screen.text), `${locale}: the test result is shown`);
            } finally {
                await settings.close();
            }
        });
    }
});

test('a recap writer that cannot run is reported as failed with its reason, and the screen still fits', { timeout: 30_000 }, async () => {
    await inWorld(async (failing) => {
        seedConfig(failing, 'TAB_RECAP_BACKEND=custom\nTAB_RECAP_CUSTOM_CMD=/nowhere/no-such-writer\n');
        const settings = await opened(failing, 100);
        try {
            await settings.press('t');
            await settings.painted((screen) => screen.text.includes('✗ failed:'), 'the failure is shown');
            for (const cols of [40, 60, 100]) {
                settings.resize(cols, 60);
                await settings.painted((seen) => seen.plain.length === 60 && seen.plain.every((line) => visibleLength(line) <= cols - 1), `${cols}: every row fits`);
            }
        } finally {
            await settings.close();
        }
    });
});

test('the settings fit 40, 60 and 100 cells in both languages, loading, choosing and editing', { timeout: 60_000 }, async () => {
    for (const locale of ['en', 'es'] as const) {
        await inWorld(async (sized) => {
            seedConfig(sized, `TAB_RECAP_LOCALE=${locale}\n`);
            const settings = await opened(sized, 100);
            try {
                const states: readonly (readonly string[])[] = [[], ['\r'], [ESC, 'l', '\r', 'x', 'y'], [ESC, 'j', 'j', 'j', 'j', 'j', 'j', 'j', 'j', 'j', 'j', 'j', 'j', 'j', 'j', 'j', 'j', 'j']];
                for (const keys of states) {
                    await typed(settings, keys);
                    for (const cols of [40, 60, 100]) {
                        settings.resize(cols, 60);
                        const screen = await settings.painted((seen) => seen.plain.length === 60 && seen.plain.every((line) => visibleLength(line) <= cols - 1) && seen.text.length > 0, `${locale} ${cols}: every row fits`);
                        assert.ok(screen.plain.every((line) => visibleLength(line) <= cols - 1), `${locale} ${cols}`);
                    }
                }
            } finally {
                await settings.close();
            }
        });
    }
});
