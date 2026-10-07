import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { en } from '#src/i18n/en.ts';
import { es } from '#src/i18n/es.ts';
import { EMPTY_NOTE, noteOf, step } from '#src/recap/application/compact-keys.ts';
import type { NoteState } from '#src/recap/application/compact-keys.ts';
import { NOTE_LIMIT } from '#src/recap/application/compaction-message.ts';
import { compactFooter, compactView } from '#src/recap/render/compact.ts';
import { plain, visibleLength } from '#src/recap/render/wrap.ts';

const ESC = String.fromCodePoint(0x1b);

function type(keys: readonly string[]): { state: NoteState; effect: ReturnType<typeof step>['effect'] } {
    let state = EMPTY_NOTE;
    let effect: ReturnType<typeof step>['effect'] = null;
    for (const key of keys) {
        ({ state, effect } = step(state, key));
    }
    return { state, effect };
}

test('Enter on an empty note sends with no note at all; Esc cancels and sends nothing', () => {
    assert.deepEqual(type(['\r']).effect, { kind: 'send', note: null });
    assert.deepEqual(type([' ', ' ', '\r']).effect, { kind: 'send', note: null }, 'blank is no note');
    assert.deepEqual(type(['a', ESC]).effect, { kind: 'cancel' });
    assert.deepEqual(type(['\u0003']).effect, { kind: 'cancel' });
});

test('a note: printable keys, Backspace, Ctrl-U, pasted text on one line, trimmed, capped', () => {
    assert.deepEqual(type(['k', 'e', 'e', 'p', ' ', 'x', 'y', '\u007f', '\r']).effect, { kind: 'send', note: 'keep x' });
    assert.equal(type(['a', 'b', '\u0015']).state.note, '');
    assert.equal(type(['line one\nline two\r\n']).state.note, 'line one line two ');
    assert.equal(noteOf('  line one\n  line two  '), 'line one line two');
    assert.equal(Array.from(type(['x'.repeat(NOTE_LIMIT + 50)]).state.note).length, NOTE_LIMIT);
    assert.equal(type([`${ESC}[A`]).state.note, '', 'an arrow key is not text');
});

test('the popup names the agent and shows the note with a cursor, in both languages; the footer fits', () => {
    assert.deepEqual(compactView({ note: 'keep x' }, en, 'claude', 40, plain), ['Compact claude', '', 'Anything it must keep? (optional)', 'keep x█']);
    assert.match(compactView(EMPTY_NOTE, es, 'codex', 40, plain).join('\n'), /Compactar codex[\s\S]*¿Algo que deba conservar\?/);
    for (const m of [en, es]) {
        assert.ok(visibleLength(compactFooter(m, 40, plain)) <= 40);
        assert.ok(compactFooter(m, 12, plain) !== '', 'a narrow popup still has a hint');
    }
});

test('the manifest offers the action and the popup pane; the CLI knows the command', () => {
    const manifest = readFileSync(new URL('../herdr-plugin.toml', import.meta.url), 'utf8');
    assert.match(manifest, /\[\[actions\]\]\nid = "compact"[\s\S]*?command = \["node", "bin\/tab-recap.mjs", "compact"\]/);
    assert.match(manifest, /\[\[panes\]\]\nid = "compact"\ntitle = "[^"]+"\nplacement = "popup"\ncommand = \["node", "src\/compact\/launch.mjs"\]/);
    assert.match(readFileSync(new URL('../bin/tab-recap.ts', import.meta.url), 'utf8'), /^    compact,$/m);
});

test('`s` opens the settings from the column and the modal: a short-lived `configure`, delayed only inside a popup', () => {
    const column = readFileSync(new URL('../src/column/main.ts', import.meta.url), 'utf8');
    assert.match(column, /^    s: openSettings,$/m);
    assert.match(column, /\[COMMAND_LAUNCHER, 'configure'\][\s\S]*TAB_RECAP_OPEN_DELAY_MS: delay/);
    assert.match(column, /const delay = mode === 'modal' \? '400' : '0';/);
    assert.match(readFileSync(new URL('../bin/tab-recap.ts', import.meta.url), 'utf8'), /TAB_RECAP_OPEN_DELAY_MS/);
});

test('the command launcher the column starts for s and c exists (it once pointed one folder too deep)', async () => {
    const { COMMAND_LAUNCHER } = await import('#src/column/command.ts');
    assert.ok(existsSync(COMMAND_LAUNCHER), COMMAND_LAUNCHER);
    assert.match(COMMAND_LAUNCHER, /tab-recap[\\/]bin[\\/]tab-recap\.mjs$/);
});
