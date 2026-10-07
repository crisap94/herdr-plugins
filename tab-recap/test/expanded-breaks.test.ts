import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import type { Break } from '#src/ports/boundaries.ts';
import { sessionFactsOf } from '#src/recap/domain/session-facts.ts';
import { expanded } from '#src/recap/render/expanded.ts';
import type { ExpandedView } from '#src/recap/render/expanded.ts';
import { visibleLength } from '#src/recap/render/wrap.ts';
import { NOW, sampleView } from '#test/fakes/expanded-fixture.ts';
import { fact } from '#test/fakes/fact-at.ts';

const at = (clock: string, day = '2026-10-07'): number => Date.parse(`${day}T${clock}:00Z`);
const BREAKS: readonly Break[] = [
    { kind: 'compacted', at: at('12:00'), trigger: 'auto', tokensBefore: 39_000, tokensAfter: 3000, tookMs: null },
    { kind: 'compacted', at: at('15:20'), trigger: 'manual', tokensBefore: 800_000, tokensAfter: 14_000, tookMs: 15_588 },
    { kind: 'switched', at: at('18:00', '2026-10-06'), trigger: null, tokensBefore: null, tokensAfter: null, tookMs: null },
];

const withBreaks = (width: number, locale: 'en' | 'es'): ExpandedView => sampleView(width, locale, {
    breaks: BREAKS,
    session: sessionFactsOf({
        firstSeen: at('09:12'), now: NOW, runs: { 'turn-ended': 36, focused: 3, requested: 2 },
        compactions: [{ tokensBefore: 800_000, tokensAfter: 14_000 }, { tokensBefore: 39_000, tokensAfter: 3000 }],
        lanes: [{ agent: 'claude', label: 'orchestrator', context: { tokens: 340_000, window: 1_000_000, source: 'table' } }],
        webs: [{ base: 'https://git.example/group/herdr-plugins', branch: 'feat/expanded' }], edits: [], chapters: 4,
    }),
});

/** Compared with the file; `UPDATE_GOLDEN=1` rewrites it (and the diff is then read by a person). */
function golden(name: string, lines: readonly string[]): void {
    const path = join(import.meta.dirname, 'fixtures', name);
    const text = `${lines.map((line) => stripVTControlCharacters(line)).join('\n')}\n`;
    if (process.env['UPDATE_GOLDEN'] === '1' || !existsSync(path)) {
        writeFileSync(path, text);
    }
    assert.equal(text, readFileSync(path, 'utf8'));
}

for (const locale of ['en', 'es'] as const) {
    for (const width of [60, 180]) {
        test(`golden: the expanded view of a session that broke, at ${width} cells in ${locale}`, () => {
            const lines = expanded(withBreaks(width, locale));
            assert.ok(lines.every((line) => visibleLength(line) <= width));
            golden(`expanded-breaks-${locale}-${width}.txt`, lines);
        });
    }
}

test('each break is a line between the facts around it, in time order; a day change still gets its date line', () => {
    const lines = expanded(withBreaks(60, 'en')).map((line) => stripVTControlCharacters(line));
    const where = (needle: string): number => lines.findIndex((line) => line.includes(needle));
    const [first, second, third] = [where('── compacted 800k → 14k · 16 s'), where('── compacted 39k → 3k'), where('── new session')];
    assert.ok(first > 0 && second > first && third > second, 'newest first');
    assert.ok(first < where('14:02 Merged !34') && where('14:02 Add a retention sweep') < second, 'the 15:20 break is above the 14:02 facts, the 12:00 one below them');
    assert.ok(second < where('2026-10-06') && where('2026-10-06') < third && third < where('17:10 Fixed the context share'), 'the date line comes first, then the break and the fact of that day');
});

test('the session facts count the chapters on the compactions line; with no compaction the count stands alone; one chapter says nothing', () => {
    assert.ok(expanded(withBreaks(120, 'en')).some((line) => line.includes('compactions 2 (800k → 14k · 39k → 3k) · chapters 4')));
    assert.ok(expanded(withBreaks(120, 'es')).some((line) => line.includes('compactaciones 2 (800k → 14k · 39k → 3k) · capítulos 4')));
    const alone = sessionFactsOf({ firstSeen: null, now: NOW, runs: {}, compactions: [], lanes: [], webs: [], edits: [], chapters: 2 });
    assert.deepEqual(expanded(sampleView(120, 'en', { session: alone })).filter((line) => line.includes('chapters')), ['chapters 2']);
    assert.equal(sessionFactsOf({ firstSeen: null, now: NOW, runs: {}, compactions: [], lanes: [], webs: [], edits: [], chapters: 1 }).chapters, null);
});

test('a view with no breaks draws exactly what it drew before', () => {
    assert.deepEqual(expanded(sampleView(60)), expanded(sampleView(60, 'en', { breaks: [] })));
});

test('the Decisions region hides the import\'s `rewritten` closes and a "(not recorded)" why, and shows a decision closed for a real reason; the timeline still shows every closed fact', () => {
    const real = fact('d1', 'decisions', 'Retry three times, not five', at('10:00'), { why: 'the gateway rate-limits after four', state: 'closed', closedWhy: 'superseded', closedAt: at('11:00') });
    const imported = fact('d2', 'decisions', 'Use the old cart endpoint', at('09:00'), { why: '(not recorded)', state: 'closed', closedWhy: 'rewritten', closedAt: at('09:30') });
    const unrecorded = fact('d3', 'decisions', 'Keep SQLite', at('09:10'), { why: '(not recorded)' });
    const lines = expanded(sampleView(60, 'en', { tasks: [{ name: '', facts: [real, imported, unrecorded], story: null, curating: false }], breaks: [] })).map((line) => stripVTControlCharacters(line));
    const text = lines.join('\n');
    const decisions = lines.slice(lines.indexOf('DECISIONS'), lines.indexOf('TIMELINE')).join('\n');
    assert.ok(decisions.includes('Retry three times, not five · closed: superseded') && decisions.includes('the gateway rate-limits after four'));
    assert.ok(!decisions.includes('old cart endpoint'), 'rewritten stays out of Decisions');
    assert.ok(decisions.includes('Keep SQLite') && !decisions.includes('(not recorded)'), 'an open decision is shown, its placeholder why is not');
    assert.ok(text.includes('09:30 Use the old cart endpoint · closed: rewritten'), 'the timeline keeps it');
    golden('expanded-decisions-en-60.txt', lines);
});
