import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setValues } from '#src/adapters/config-file.ts';
import { parseEnv } from '#src/daemon/config.ts';
import { en } from '#src/i18n/en.ts';
import { es } from '#src/i18n/es.ts';
import { draftFrom, initial, step, tested, withAvailable } from '#src/recap/application/setup-keys.ts';
import type { Setup } from '#src/recap/application/setup-keys.ts';
import { setupFooter, setupView } from '#src/recap/render/setup.ts';
import { visibleLength } from '#src/recap/render/wrap.ts';

const models = { claude: '', codex: 'gpt-6-luna', opencode: '', hermes: '', custom: '' };
const base = initial(draftFrom({ backend: 'codex', models }, { locale: undefined, recapLanguage: undefined }), { locale: 'TAB_RECAP_LOCALE' });

function typed(state: Setup, keys: readonly string[]): Setup {
    return keys.reduce((now, key) => step(now, key).state, state);
}

const states: readonly [string, Setup][] = [
    ['loading', base],
    ['available', withAvailable(base, ['claude', 'codex', 'opencode'])],
    ['no agent', typed(withAvailable({ ...base, draft: { ...base.draft, backend: 'auto' } }, []), ['j'])],
    ['choosing', typed(withAvailable(base, ['claude']), ['\r', 'j'])],
    ['editing', typed(withAvailable(base, ['claude']), ['j', '\r', 'x', 'y'])],
    ['locked', typed(withAvailable(base, ['claude']), ['j', 'j', '\r'])],
    ['language', typed(withAvailable(base, ['claude']), ['j', 'j', 'j'])],
    ['locale choices', typed(withAvailable({ ...base, locks: {} }, ['claude']), ['j', 'j', '\r'])],
    ['unsaved', typed(withAvailable(base, ['claude']), ['\r', 'j', '\r', 'q'])],
    ['test ok', tested(withAvailable(base, ['claude']), { kind: 'ok', seconds: 3.24, costUsd: 0.0008 })],
    ['test failed', tested(withAvailable(base, ['claude']), { kind: 'failed', why: 'exited 127: opencode not found, a rather long explanation' })],
    ['save failed', { ...withAvailable(base, ['claude']), note: { failed: 'EACCES: permission denied, open config.env' } }],
];

function assertFits(messages: typeof en, width: number, name: string, state: Setup): void {
    for (const line of setupView(state, messages, width)) {
        assert.ok(visibleLength(line) <= width, `${messages.locale} ${width} ${name}: "${line}"`);
    }
    assert.ok(visibleLength(setupFooter(state, messages, width)) <= width);
}

test('the settings modal fits 40, 60 and 100 columns in both languages, in every state', () => {
    for (const messages of [en, es]) {
        for (const width of [40, 60, 100]) {
            states.forEach(([name, state]) => { assertFits(messages, width, name, state); });
        }
    }
});

test('the harness list marks the current one ✓, the available ones ● and the missing ones ○', () => {
    const text = setupView(withAvailable(base, ['claude', 'opencode']), en, 80).join('\n');
    assert.match(text, /○ hermes/);
    assert.match(text, /✓ codex/);
    assert.match(text, /● claude/);
    assert.match(text, /● opencode/);
    assert.match(text, /auto — the first one found: claude → codex → opencode → hermes/);
});

test('a locked row names its variable; the model row names its harness; both languages say so', () => {
    for (const [messages, expected] of [[en, 'read-only: TAB_RECAP_LOCALE'], [es, 'solo lectura: TAB_RECAP_LOCALE']] as const) {
        const text = setupView(withAvailable(base, ['codex']), messages, 80).join('\n');
        assert.ok(text.includes(expected));
        assert.ok(text.includes(`${messages.setup.rows.model} (codex)`));
        assert.ok(text.includes('gpt-6-luna'));
    }
});

test('Spanish: rows, legend, hints and test results are Spanish', () => {
    const text = setupView(tested(withAvailable(base, ['claude']), { kind: 'ok', seconds: 3.24, costUsd: 0.0008 }), es, 80).join('\n');
    for (const expected of ['ajustes', 'Agente', 'Idioma del resumen', 'disponible', 'no está en el PATH', '✓ funciona — 3.2 s · $0.0008']) {
        assert.ok(text.includes(expected), expected);
    }
    assert.match(setupFooter(base, es, 80), /guardar/);
});

test('config-file: a save changes only its keys and keeps every comment and other line', () => {
    const dir = mkdtempSync(join(tmpdir(), 'recap-file-'));
    try {
        const path = join(dir, 'config.env');
        writeFileSync(path, '# my notes\nTAB_RECAP_BACKEND=codex\n\nTAB_RECAP_CODEX_MODEL=gpt-6-luna   # legacy\nTAB_RECAP_GLOW=450\n');
        setValues(path, new Map([['TAB_RECAP_GLOW', '600'], ['TAB_RECAP_RECAP_LANG', 'es']]), parseEnv);
        const text = readFileSync(path, 'utf8');
        assert.equal(text, '# my notes\nTAB_RECAP_BACKEND=codex\n\nTAB_RECAP_CODEX_MODEL=gpt-6-luna   # legacy\nTAB_RECAP_GLOW=600\nTAB_RECAP_RECAP_LANG=es\n');
        assert.equal(parseEnv(text).get('TAB_RECAP_GLOW'), '600');
        setValues(join(dir, 'new', 'config.env'), new Map([['A', '1']]), parseEnv);
        assert.equal(readFileSync(join(dir, 'new', 'config.env'), 'utf8'), 'A=1\n');
    } finally {
        rmSync(dir, { recursive: true });
    }
});

const rowText = (state: Setup, messages: typeof en): string => setupView(state, messages, 80).find((line) => line.includes(messages.setup.rows.recapLanguage)) ?? '';
const withLanguage = (recapLanguage: string): Setup => ({ ...base, draft: { ...base.draft, recapLanguage } });

test('the recap language row says what the stored value means, in the interface language', () => {
    assert.match(rowText(withLanguage('ui'), en), /same as interface \(English\)/);
    assert.match(rowText(withLanguage('ui'), es), /igual que la interfaz \(español\)/);
    assert.match(rowText(withLanguage('en'), en), /English/);
    assert.match(rowText(withLanguage('es'), en), /Spanish/);
    assert.match(rowText(withLanguage('en'), es), /inglés/);
    assert.match(rowText(withLanguage('es'), es), /español/);
    assert.match(rowText(withLanguage('Português'), es), /Português/);
    assert.equal(withLanguage('ui').draft.recapLanguage, 'ui', 'the stored value is untouched');
});

test('the git note row is drawn with its value and, while choosing, both choices', () => {
    const onRow = setupView(base, en, 80).join('\n');
    assert.match(onRow, /Git note\s+on — branch/);
    const choosing = setupView(step(step({ ...base, row: 5 }, '\r').state, 'j').state, es, 80).join('\n');
    assert.match(choosing, /Nota de git/);
    assert.match(choosing, /▸ no/);
});

test('the compaction rows are drawn in both languages: 40% by default, the window empty means detected', () => {
    const english = setupView(base, en, 90).join('\n');
    assert.match(english, /Compact\s+focused/);
    assert.match(english, /Compact hint\s+40%/);
    assert.match(english, /Context window/);
    const spanish = setupView({ ...base, row: 8 }, es, 90).join('\n');
    assert.match(spanish, /Aviso de compactar\s+40%/);
    assert.match(spanish, /Ventana de contexto/);
    assert.match(spanish, /muestra «compactar\?»/, 'the focused row explains itself');
    assert.match(spanish, /Ventana de contexto\s+se detecta/);
    assert.match(english, /Context window\s+found at runtime/);
    assert.match(setupView({ ...base, draft: { ...base.draft, compactHint: 'off' } }, en, 90).join('\n'), /Compact hint\s+off/);
});
