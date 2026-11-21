import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ACTION, FOOTER } from '../mods/tab-recap/constants.js';
import type { KeyPress } from '../types/tab-recap-keys.d.ts';
import { keyAction } from 'herdr-desktop-mods/tab-recap/keys';

const modifiers = { shift: false, control: false, alt: false, platform: false, function: false };
const press = (key: string, held: Partial<typeof modifiers> = {}): KeyPress => ({ key, keystroke: key, modifiers: { ...modifiers, ...held } });

test('the arrow keys move the selection', () => {
    assert.equal(keyAction(press('down'), false)?.action, ACTION.down);
    assert.equal(keyAction(press('up'), false)?.action, ACTION.up);
});

test('j and k are not keys any more', () => {
    assert.equal(keyAction(press('j'), false), null);
    assert.equal(keyAction(press('k'), false), null);
});

test('the footer names the arrows, not j and k', () => {
    const move = FOOTER.find((f) => f.label === 'move');
    assert.deepEqual(move?.keys, ['↑', '↓']);
});

test('a held modifier or a field with the keyboard silences the keys', () => {
    assert.equal(keyAction(press('down', { control: true }), false), null);
    assert.equal(keyAction(press('down'), true), null);
});

test('Enter opens the selected item, under either name the host may give it', () => {
    assert.equal(keyAction(press('enter'), false)?.action, ACTION.open);
    assert.equal(keyAction(press('return'), false)?.action, ACTION.open);
});

test('Enter still opens while the filter field has the keyboard, and nothing else does', () => {
    assert.equal(keyAction(press('enter'), true)?.action, ACTION.open);
    assert.equal(keyAction(press('r'), true), null);
    assert.equal(keyAction(press('1'), true), null);
});
