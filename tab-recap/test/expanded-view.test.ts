import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expanded } from '#src/recap/render/expanded.ts';
import { visibleLength } from '#src/recap/render/wrap.ts';
import { stripVTControlCharacters } from 'node:util';
import { sampleView } from '#test/fakes/expanded-fixture.ts';

const GOLDENS = join(import.meta.dirname, 'fixtures');

function golden(name: string, lines: readonly string[]): void {
    const path = join(GOLDENS, name);
    const text = `${lines.map((line) => stripVTControlCharacters(line)).join('\n')}\n`;
    if (process.env['UPDATE_GOLDEN'] === '1' || !existsSync(path)) {
        writeFileSync(path, text);
    }
    assert.equal(text, readFileSync(path, 'utf8'));
}

for (const locale of ['en', 'es'] as const) {
    for (const width of [60, 120, 140, 180]) {
        test(`golden: the expanded view at ${width} cells in ${locale}`, () => {
            const lines = expanded(sampleView(width, locale));
            assert.ok(lines.every((line) => visibleLength(line) <= width), 'no row is wider than the view');
            golden(`expanded-${locale}-${width}.txt`, lines);
        });
    }
}

test('a question that has waited 25 minutes says so, and the older one says 3 h', () => {
    const text = expanded(sampleView(120)).join('\n');
    assert.match(text, /Which effort should the curator default to: low or medium\? · waiting 25 min/u);
    assert.match(text, /waiting 3 h/u);
    assert.ok(text.indexOf('waiting 3 h') < text.indexOf('waiting 25 min'), 'oldest first');
});

test('a decision shows its why on the next line', () => {
    const lines = expanded(sampleView(120));
    const at = lines.findIndex((line) => line.includes('Keep the guard out of sibling modules'));
    assert.ok(at >= 0);
    assert.match(lines[at + 1] ?? '', /^\s+an import guard cannot stop sibling modules/u);
});

test('a next fact closed as wrong at 14:02 is in the timeline marked closed: wrong', () => {
    assert.ok(expanded(sampleView(120)).some((line) => line.includes('14:02 Add a retention sweep to this change · closed: wrong')));
});

test('the timeline is newest first and a day change gets a date line', () => {
    const lines = expanded(sampleView(60));
    const timeline = lines.slice(lines.findIndex((line) => line === 'TIMELINE'));
    assert.ok(timeline.findIndex((line) => line.includes('14:03') || line.includes('14:02')) > 0);
    assert.ok(timeline.includes('2026-10-06'));
    assert.ok(timeline.indexOf('2026-10-06') > timeline.findIndex((line) => line.includes('Merged !34')));
});

test('from 140 cells it is two columns of (width − 3) / 2 with a gutter; below, one column in the stated order', () => {
    const wide = expanded(sampleView(180));
    assert.ok(wide.every((line) => visibleLength(line) <= 88 + 3 + 88));
    assert.ok(wide.some((line) => line.indexOf('│') === 89));
    const narrow = expanded(sampleView(139)).filter((line) => /^[A-ZÁÉÍÓÚ ]+( · .*)?$/u.test(line) && line !== '').map((line) => line.split(' · ')[0]);
    assert.deepEqual(narrow, ['SESSION SO FAR', 'GOAL', 'NOW', 'NEEDS YOU', 'DECISIONS', 'TIMELINE', 'NEXT', 'RULES', 'LINKS', 'SESSION']);
    assert.ok(!expanded(sampleView(139)).some((line) => line.includes('│')));
});

test('two columns scroll together: one row per zipped line, left padded', () => {
    const wide = expanded(sampleView(140));
    assert.ok(wide.every((line) => visibleLength(line.split(' │')[0] ?? '') === 68), 'the left cell is as wide as its column');
});

test('the story shows its time, and "updating…" while the curator runs, and nothing when there is neither', () => {
    const [task] = sampleView(120).tasks;
    assert.ok(task);
    const running = expanded(sampleView(120, 'en', { tasks: [{ ...task, curating: true }] })).join('\n');
    assert.match(running, /SESSION SO FAR · 16:10 · updating…/u);
    const first = expanded(sampleView(120, 'en', { tasks: [{ ...task, story: null, curating: true }] }));
    assert.equal(first[0], 'SESSION SO FAR · updating…');
    assert.ok(!expanded(sampleView(120, 'en', { tasks: [{ ...task, story: null }] })).join('\n').includes('SESSION SO FAR'));
});

test('several tasks: each is headed by its name and the session facts come once, last', () => {
    const [task] = sampleView(120).tasks;
    assert.ok(task);
    const lines = expanded(sampleView(120, 'en', { tasks: [{ ...task, name: 'Engine' }, { ...task, name: 'Docs' }] }));
    assert.ok(lines.includes('▌ Engine') && lines.includes('▌ Docs'));
    assert.equal(lines.filter((line) => line === 'SESSION').length, 1);
});

test('a tab with no task yet says there is no recap, and still shows the session facts', () => {
    const lines = expanded(sampleView(120, 'en', { tasks: [] }));
    assert.match(lines[0] ?? '', /No recap yet/u);
    assert.ok(lines.includes('SESSION'));
});
