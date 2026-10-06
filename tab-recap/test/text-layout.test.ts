import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripVTControlCharacters } from 'node:util';
import { en } from '#src/i18n/en.ts';
import { present, presentBar } from '#src/recap/render/present.ts';
import { plain, visibleLength, wrap } from '#src/recap/render/wrap.ts';
import { blankRecap } from '#src/ports/recap-records.ts';
import { oneTask } from '#test/support.ts';

const ESC = String.fromCodePoint(0x1b);
const ACUTE = String.fromCodePoint(0x301);
const ZWJ_WOMAN_TECHNOLOGIST = '👩‍💻';

test('width: colour escapes around `recap` take no cells', () => {
    assert.equal(visibleLength(`${ESC}[1m${ESC}[36mrecap${ESC}[39m${ESC}[22m`), 5);
});

test('width: an emoji takes two cells', () => {
    assert.equal(visibleLength('📝✅'), 4);
});

test('width: a joined emoji is two cells and a letter with its combining accent is one', () => {
    assert.equal(visibleLength(`${ZWJ_WOMAN_TECHNOLOGIST}e${ACUTE}`), 3);
});

test('width: a flag is one character of two cells; a symbol without emoji presentation is one', () => {
    assert.equal(visibleLength('🇪🇸'), 2);
    assert.equal(visibleLength('⚑▸●'), 3);
});

test('wrap: emoji near the edge move to the next line, no line is wider than 8 cells', () => {
    for (const line of wrap('xxxxxxx 📝📝📝', 8)) {
        assert.ok(visibleLength(line) <= 8, line);
    }
});

test('wrap: a long word of emoji is cut between whole characters and rejoins to the original', () => {
    const word = 'xxxxxxx📝📝📝';
    const lines = wrap(word, 8);
    assert.ok(lines.length > 1);
    for (const line of lines) {
        assert.ok(visibleLength(line) <= 8, line);
        assert.doesNotMatch(line, /[\uD800-\uDFFF]/u, 'no half of a surrogate pair');
    }
    assert.equal(lines.join(''), word);
});

test('wrap: a long word of accented letters never starts a line with the accent', () => {
    const word = `e${ACUTE}`.repeat(20);
    const lines = wrap(word, 8);
    assert.ok(lines.length > 1);
    for (const line of lines) {
        assert.doesNotMatch(line, new RegExp(`^${ACUTE}`, 'u'));
        assert.ok(visibleLength(line) <= 8);
    }
    assert.equal(lines.join(''), word);
});

test('wrap: a cut inside a coloured word keeps its escapes and takes no room for them', () => {
    const word = `${ESC}[90m${'y'.repeat(20)}${ESC}[39m`;
    const lines = wrap(word, 8);
    assert.deepEqual(lines.map(visibleLength), [8, 8, 4]);
    assert.equal(stripVTControlCharacters(lines.join('')), 'y'.repeat(20));
});

const noGlow = (): null => null;
const lane = { cwd: '/work', pane: 'w1:t1:p1', agent: 'claude', status: 'working', title: 'work', lastPrompt: 'do 📝 things ✅' } as const;
const view = (style?: typeof plain): Parameters<typeof present>[0] => ({
    tab: { tab: 'w1:t1', column: null, at: 0, lanes: [lane] },
    recap: { ...blankRecap('w1:t1'), at: 0, tasks: oneTask('## Now\n- 📝📝📝📝📝📝📝📝📝📝 ✅✅✅✅✅✅✅✅✅✅ done') },
    notes: new Map(),
    warnings: [],
    now: 60_000,
    messages: en,
    ...(style === undefined ? {} : { style }),
});

test('layout: with emoji in every part, no column line is wider than the column (they used to overflow)', () => {
    for (const line of present(view(), 30, noGlow)) {
        assert.ok(visibleLength(line) <= 30, line);
    }
    for (const line of presentBar(view(), 30)) {
        assert.ok(visibleLength(line) <= 30, line);
    }
});

