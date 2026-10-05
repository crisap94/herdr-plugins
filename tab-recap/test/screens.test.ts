import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lineToHtml, pages } from '../docs/screens/render.ts';

const ESC = String.fromCodePoint(0x1b);

test('the README screenshots: one page per screen, in both languages, with no escape left over', () => {
    const names = pages().map((page) => page.name).toSorted();
    assert.deepEqual(names, ['bar-en', 'bar-es', 'column-en', 'column-es', 'setup-en', 'setup-es']);
    for (const { name, html } of pages()) {
        assert.ok(!html.includes(ESC), `${name} still holds a terminal escape`);
        assert.ok(html.length > 1000, `${name} is empty`);
    }
});

test('the screenshots show invented data in the language asked', () => {
    const byName = new Map(pages().map((page) => [page.name, page.html]));
    assert.match(byName.get('column-en') ?? '', /Checkout migration/);
    assert.match(byName.get('column-es') ?? '', /Migración del checkout/);
    assert.match(byName.get('setup-es') ?? '', /Idioma del resumen/);
});

test('styles and markup characters become spans and entities', () => {
    const html = lineToHtml(`${ESC}[1m<b>${ESC}[22m ${ESC}[31mred${ESC}[39m & plain`);
    assert.match(html, /<span class="b">&lt;b&gt;<\/span>/);
    assert.match(html, /<span class="" style="color:#ff6b6b">red<\/span>/);
    assert.match(html, /&amp; plain/);
});
