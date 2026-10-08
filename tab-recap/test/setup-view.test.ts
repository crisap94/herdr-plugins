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
import { plain, visibleLength } from '#src/recap/render/wrap.ts';

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
    ['editing', typed(withAvailable(base, ['claude']), ['l', '\r', 'x', 'y'])],
    ['locked', typed(withAvailable(base, ['claude']), ['j', 'j', '\r'])],
    ['language', typed(withAvailable(base, ['claude']), ['j', 'j', 'j'])],
    ['locale choices', typed(withAvailable({ ...base, locks: {} }, ['claude']), ['j', 'j', '\r'])],
    ['unsaved', typed(withAvailable(base, ['claude']), ['\r', 'j', '\r', 'q'])],
    ['test ok', tested(withAvailable(base, ['claude']), { kind: 'ok', seconds: 3.24, costUsd: 0.0008 })],
    ['test failed', tested(withAvailable(base, ['claude']), { kind: 'failed', why: 'exited 127: opencode not found, a rather long explanation' })],
    ['autocompact rows', typed(withAvailable(base, ['claude']), [...Array.from({ length: 13 }, () => 'j'), '\r'])],
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

test('a locked row names its variable; the recap writer row shows harness · model · effort; both languages say so', () => {
    for (const [messages, expected] of [[en, 'read-only: TAB_RECAP_LOCALE'], [es, 'solo lectura: TAB_RECAP_LOCALE']] as const) {
        const text = setupView(withAvailable(base, ['codex']), messages, 80).join('\n');
        assert.ok(text.includes(expected));
        assert.match(text, new RegExp(`${messages.setup.rows.recapJob}\\s+\\[codex\\] · gpt-6-luna · medium`));
    }
});

test('Spanish: rows, legend, hints and test results are Spanish', () => {
    const text = setupView(tested(withAvailable(base, ['claude']), { kind: 'ok', seconds: 3.24, costUsd: 0.0008 }), es, 80).join('\n');
    for (const expected of ['ajustes', 'Redactor del resumen', 'Idioma del resumen', 'disponible', 'no está en el PATH', '✓ funciona — 3.2 s · $0.0008']) {
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
    const spanish = setupView({ ...base, row: 7 }, es, 90).join('\n');
    assert.match(spanish, /Aviso de compactar\s+40%/);
    assert.match(spanish, /Ventana de contexto/);
    assert.match(spanish, /muestra «compactar\?»/, 'the focused row explains itself');
    assert.match(spanish, /Ventana de contexto\s+se detecta/);
    assert.match(english, /Context window\s+found at runtime/);
    assert.match(setupView({ ...base, draft: { ...base.draft, compactHint: 'off' } }, en, 90).join('\n'), /Compact hint\s+off/);
});

test('the Models group: a heading, one row per job showing harness · model · effort, the focused part bracketed, in both languages', () => {
    const english = setupView(withAvailable(base, ['codex']), en, 100).join('\n');
    assert.match(english, /Models — harness · model · effort/);
    assert.match(english, /Recap writer\s+\[codex\] · gpt-6-luna · medium/);
    assert.match(english, /Compact brief\s+as the recap writer · the recap writer's model · high/);
    const second = setupView(typed(withAvailable(base, ['codex']), ['j', 'l']), en, 100).join('\n');
    assert.match(second, /Compact brief\s+as the recap writer · \[the recap writer's model\] · high/);
    assert.match(second, /writes what the agent keeps when it is compacted/, 'the focused job explains itself');
    const spanish = setupView(base, es, 100).join('\n');
    assert.match(spanish, /Modelos — agente · modelo · esfuerzo/);
    assert.match(spanish, /Guion de compactar\s+como el redactor · el modelo del redactor · high/);
    const set = { ...base, draft: { ...base.draft, compact: { by: 'claude' as const, model: 'sonnet', effort: 'medium' as const } } };
    assert.match(setupView(set, en, 100).join('\n'), /Compact brief\s+claude · sonnet · medium/);
    const choosing = setupView(typed(withAvailable(base, ['codex']), ['j', '\r']), en, 100).join('\n');
    assert.match(choosing, /▸ as the recap writer — the same harness/);
    assert.match(choosing, /off — compact with the template/);
    const typing = setupView(typed(withAvailable(base, ['codex']), ['j', 'l', '\r', 'x']), en, 100).join('\n');
    assert.match(typing, /\[x█\]/);
});

test('the judge row closes the Models group: harness · model · effort in both languages, its hint while focused, the off choice says what off means', () => {
    const at = typed(withAvailable(base, ['claude']), Array.from({ length: 9 }, () => 'j'));
    for (const [messages, label, hint, off] of [[en, 'Recap judge', 'scores stored recaps', 'off — no judge'], [es, 'Juez del resumen', 'puntúa los resúmenes', 'off — sin juez']] as const) {
        const view = setupView(at, messages, 100, plain).join('\n');
        assert.match(view, new RegExp(`▸ ${label} +\\[${messages.setup.jobBy['recap']}\\] · ${messages.setup.compactModelSame} · medium`));
        assert.ok(view.includes(hint));
        assert.ok(setupView(typed(at, ['\r']), messages, 100, plain).join('\n').includes(off));
    }
    assert.doesNotMatch(setupView(withAvailable(base, ['claude']), en, 100, plain).join('\n'), /scores stored recaps/, 'the hint shows only while the row is focused');
});

test('the autocompact rows show their value, the focused one its hint, and the decider offers jev without a key', () => {
    const rows = typed(withAvailable(base, ['claude']), Array.from({ length: 11 }, () => 'j'));
    const text = setupView(rows, en, 120).join('\n');
    assert.match(text, /Autocompact\s+shadow — decides and records, never compacts/);
    assert.match(text, /Autocompact at\s+40%/);
    assert.match(text, /Autocompact decider\s+as the recap writer · the recap writer's model · low/);
    assert.match(text, /compacts an idle agent by itself/);
    const choosing = setupView(typed(withAvailable(base, ['claude']), [...Array.from({ length: 13 }, () => 'j'), '\r']), en, 140).join('\n');
    assert.match(choosing, /jev — the TypeSafe API; the key is read from the environment or ~\/\.config\/typesafe-api-key, never shown here/);
    assert.doesNotMatch(choosing, /Bearer|sk-|SENTINEL/u);
    assert.match(setupView(rows, es, 120).join('\n'), /Autocompactar\s+shadow — decide y registra, nunca compacta/);
});
