import { test } from 'node:test';
import assert from 'node:assert/strict';
import { messagesFor } from '#src/i18n/index.ts';
import type { Break } from '#src/ports/boundaries.ts';
import { breakLine, chaptersFact } from '#src/recap/render/timeline-breaks.ts';

const [en, es] = [messagesFor('en').chapters, messagesFor('es').chapters];
const compacted = (over: Partial<Break> = {}): Break => ({ kind: 'compacted', at: 1, trigger: 'auto', tokensBefore: 800_000, tokensAfter: 14_000, tookMs: 15_588, ...over });
const switched: Break = { kind: 'switched', at: 1, trigger: null, tokensBefore: null, tokensAfter: null, tookMs: null };

test('golden: a compaction with its tokens and time, with its tokens only, with nothing, with a time only', () => {
    assert.equal(breakLine(compacted(), en), '── compacted 800k → 14k · 16 s ──');
    assert.equal(breakLine(compacted({ tookMs: null }), en), '── compacted 800k → 14k ──');
    assert.equal(breakLine(compacted({ tokensBefore: null, tokensAfter: null, tookMs: null }), en), '── compacted ──');
    assert.equal(breakLine(compacted({ tokensBefore: null, tokensAfter: null }), en), '── compacted 16 s ──');
});

test('a number that is half known is left out, never guessed', () => {
    assert.equal(breakLine(compacted({ tokensAfter: null, tookMs: null }), en), '── compacted ──');
    assert.equal(breakLine(compacted({ tokensBefore: null, tookMs: null }), en), '── compacted ──');
});

test('golden: the short forms and long times', () => {
    assert.equal(breakLine(compacted({ tokensBefore: 39_532, tokensAfter: 3057, tookMs: 65_000 }), en), '── compacted 39.5k → 3.1k · 1 min 5 s ──');
    assert.equal(breakLine(compacted({ tokensBefore: 1_200_000, tokensAfter: 812, tookMs: 120_000 }), en), '── compacted 1.2M → 812 · 2 min ──');
    assert.equal(breakLine(compacted({ tookMs: 100 }), en), '── compacted 800k → 14k · 1 s ──', 'a measured time is never 0 s');
});

test('golden: a new session, in both languages; Spanish for a compaction', () => {
    assert.equal(breakLine(switched, en), '── new session ──');
    assert.equal(breakLine(switched, es), '── sesión nueva ──');
    assert.equal(breakLine(compacted(), es), '── compactado 800k → 14k · 16 s ──');
});

test('golden: across the column, the closing rule reaches the edge; text that does not fit is cut', () => {
    const wide = breakLine(compacted(), en, 44);
    assert.equal(wide, '── compacted 800k → 14k · 16 s ─────────────');
    assert.equal(wide.length, 44);
    assert.equal(breakLine(switched, en, 30), '── new session ───────────────');
    assert.equal(breakLine(switched, en, 30).length, 30);
    const narrow = breakLine(compacted(), en, 20);
    assert.ok(narrow.length <= 22 && narrow.includes('…'), narrow);
    assert.ok(narrow.startsWith('── compacted 800k'));
});

test('the session facts count the chapters', () => {
    assert.equal(chaptersFact(3, en), 'chapters 3');
    assert.equal(chaptersFact(3, es), 'capítulos 3');
    assert.equal(`compactions 2 (800k → 14k · 39k → 3k) · ${chaptersFact(3, en)}`, 'compactions 2 (800k → 14k · 39k → 3k) · chapters 3');
});
