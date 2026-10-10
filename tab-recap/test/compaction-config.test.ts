import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contextOf, hintFor, sizeOf, hintOf, hintSetting, targetOf, targetSetting, windowOf } from '#src/recap/domain/compaction.ts';
import type { ContextUse, Observed } from '#src/recap/domain/compaction.ts';
import { windowOfKind } from '#src/adapters/context-window.ts';

test('target: focused by default, all, or kinds', () => {
    assert.deepEqual(targetOf(undefined), { kind: 'focused' });
    assert.deepEqual(targetOf('focused'), { kind: 'focused' });
    assert.deepEqual(targetOf('ALL'), { kind: 'all' });
    assert.deepEqual(targetOf('claude, codex'), { kind: 'kinds', kinds: ['claude', 'codex'] });
    assert.equal(targetSetting('codex claude codex'), 'codex,claude');
    assert.equal(targetSetting(''), 'focused');
});

test('hint: 40 % by default, 10–95 allowed, off turns it off, nonsense is the default', () => {
    assert.equal(hintOf(undefined), 40);
    assert.equal(hintOf(''), 40);
    assert.equal(hintOf('10'), 10);
    assert.equal(hintOf('95%'), 95);
    assert.equal(hintOf('9'), 40);
    assert.equal(hintOf('96'), 40);
    assert.equal(hintOf('lots'), 40);
    assert.equal(hintOf(' Off '), null);
    assert.equal(hintSetting('off'), 'off');
    assert.equal(hintSetting(undefined), '40');
});

test('window setting: a sensible number overrides; empty or nonsense means detect at runtime', () => {
    assert.equal(windowOf(undefined), null);
    assert.equal(windowOf('1_000_000'), 1_000_000);
    assert.equal(windowOf('12'), null);
});

const use = (tokens: number): { tokens: number; window: number; source: 'agent' } => ({ tokens, window: 200_000, source: 'agent' });
const seen = { tokens: 90_000, peak: 0, window: null, model: 'claude-opus-4-7' } as const;
const context = (observed: Observed, kind: string, setting: number | null, catalogued: number | null): ContextUse | null => contextOf(
    { observed, setting },
    windowOfKind(kind, { windowOf: () => catalogued }),
);

test('context window, runtime first: setting, agent, catalogue, family table — in that order', () => {
    assert.deepEqual(context(seen, 'claude', 500_000, 200_000), { tokens: 90_000, window: 500_000, source: 'setting' });
    assert.deepEqual(context({ ...seen, window: 258_400 }, 'codex', null, 1_000_000), { tokens: 90_000, window: 258_400, source: 'agent' });
    assert.deepEqual(context(seen, 'opencode', null, 128_000), { tokens: 90_000, window: 128_000, source: 'catalogue' });
    assert.deepEqual(context(seen, 'claude', null, null), { tokens: 90_000, window: 1_000_000, source: 'table' });
    assert.equal(context(seen, 'opencode', null, null), null, 'nothing says what an unknown model holds');
});

test('observed use raises a window that was too small: 200k → 1M, by tokens or by the size before a compaction; a setting is never raised', () => {
    const small = { tokens: 250_000, peak: 0, window: null, model: 'claude-opus-4-5' } as const;
    assert.deepEqual(context(small, 'claude', null, 200_000), { tokens: 250_000, window: 1_000_000, source: 'observed' });
    assert.deepEqual(context({ ...small, tokens: 30_000, peak: 554_888 }, 'claude', null, null), { tokens: 30_000, window: 1_000_000, source: 'observed' });
    assert.equal(context(small, 'claude', 200_000, null)?.window, 200_000);
    assert.equal(context({ ...small, tokens: 2_500_000 }, 'claude', null, 200_000)?.window, 2_500_000);
});

test('sizes read as words', () => {
    assert.deepEqual([200_000, 258_400, 1_000_000, 1_500_000].map(sizeOf), ['200k', '258k', '1M', '1.5M']);
});

test('the hint shows the share once it reaches the threshold, never below it, never when off', () => {
    assert.equal(hintFor(use(90_000), 40), 45);
    assert.equal(hintFor(use(79_000), 40), null);
    assert.equal(hintFor(use(80_000), 40), 40);
    assert.equal(hintFor(use(190_000), null), null);
    assert.equal(hintFor(null, 40), null);
});
