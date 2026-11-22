import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contextOf, hintFor, sizeOf, hintOf, hintSetting, targetOf, targetSetting, windowOf } from '#src/recap/domain/compaction.ts';
import type { ContextUse, Observed } from '#src/recap/domain/compaction.ts';
import { windowOfKind } from '#src/adapters/capability/context-window.ts';
import { countOf } from '#src/recap/domain/count.ts';
import { textOf } from '#src/recap/domain/text.ts';

test('target: focused by default, all, or kinds', () => {
    assert.deepEqual(targetOf(undefined), { kind: 'focused' });
    assert.deepEqual(targetOf('focused'), { kind: 'focused' });
    assert.deepEqual(targetOf('ALL'), { kind: 'all' });
    assert.deepEqual(targetOf('claude, codex'), { kind: 'kinds', kinds: ['claude', 'codex'] });
    assert.equal(targetSetting(textOf('codex claude codex')), 'codex,claude');
    assert.equal(targetSetting(textOf('')), 'focused');
});

test('hint: 40 % by default, 10–95 allowed, off turns it off, nonsense is the default', () => {
    assert.equal(hintOf(undefined), 40);
    assert.equal(hintOf(textOf('')), 40);
    assert.equal(hintOf(textOf('10')), 10);
    assert.equal(hintOf(textOf('95%')), 95);
    assert.equal(hintOf(textOf('9')), 40);
    assert.equal(hintOf(textOf('96')), 40);
    assert.equal(hintOf(textOf('lots')), 40);
    assert.equal(hintOf(textOf(' Off ')), null);
    assert.equal(hintSetting(textOf('off')), 'off');
    assert.equal(hintSetting(undefined), '40');
});

test('window setting: a sensible number overrides; empty or nonsense means detect at runtime', () => {
    assert.equal(windowOf(undefined), null);
    assert.equal(windowOf(textOf('1_000_000')), 1_000_000);
    assert.equal(windowOf(textOf('12')), null);
});

const use = (tokens: number): ContextUse => ({ tokens: countOf(tokens), window: countOf(200_000), source: 'agent' });
const seen: Observed = { tokens: countOf(90_000), peak: countOf(0), window: null, model: textOf('claude-opus-4-7') };
const context = (observed: Observed, kind: string, setting: number | null, catalogued: number | null): ContextUse | null => contextOf(
    { observed, setting: setting === null ? null : countOf(setting) },
    windowOfKind(kind, { windowOf: () => (catalogued === null ? null : countOf(catalogued)) }),
);

test('context window, runtime first: setting, agent, catalogue, family table — in that order', () => {
    assert.deepEqual(context(seen, 'claude', 500_000, 200_000), { tokens: 90_000, window: 500_000, source: 'setting' });
    assert.deepEqual(context({ ...seen, window: countOf(258_400) }, 'codex', null, 1_000_000), { tokens: 90_000, window: 258_400, source: 'agent' });
    assert.deepEqual(context(seen, 'opencode', null, 128_000), { tokens: 90_000, window: 128_000, source: 'catalogue' });
    assert.deepEqual(context(seen, 'claude', null, null), { tokens: 90_000, window: 1_000_000, source: 'table' });
    assert.equal(context(seen, 'opencode', null, null), null, 'nothing says what an unknown model holds');
});

test('observed use raises a window that was too small: 200k → 1M, by tokens or by the size before a compaction; a setting is never raised', () => {
    const small: Observed = { tokens: countOf(250_000), peak: countOf(0), window: null, model: textOf('claude-opus-4-5') };
    assert.deepEqual(context(small, 'claude', null, 200_000), { tokens: 250_000, window: 1_000_000, source: 'observed' });
    assert.deepEqual(context({ ...small, tokens: countOf(30_000), peak: countOf(554_888) }, 'claude', null, null), { tokens: 30_000, window: 1_000_000, source: 'observed' });
    assert.equal(context(small, 'claude', 200_000, null)?.window, 200_000);
    assert.equal(context({ ...small, tokens: countOf(2_500_000) }, 'claude', null, 200_000)?.window, 2_500_000);
});

test('sizes read as words', () => {
    assert.deepEqual([200_000, 258_400, 1_000_000, 1_500_000].map((size) => sizeOf(countOf(size))), ['200k', '258k', '1M', '1.5M']);
});

test('the hint shows the share once it reaches the threshold, never below it, never when off', () => {
    assert.equal(hintFor(use(90_000), countOf(40)), 45);
    assert.equal(hintFor(use(79_000), countOf(40)), null);
    assert.equal(hintFor(use(80_000), countOf(40)), 40);
    assert.equal(hintFor(use(190_000), null), null);
    assert.equal(hintFor(null, countOf(40)), null);
});
