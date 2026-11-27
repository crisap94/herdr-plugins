import { test } from 'node:test';
import { kindOf } from '#test/fakes/agent-kind.ts';
import assert from 'node:assert/strict';
import { contextOf, hintFor, sizeOf } from '@stateforge-labs/session-ledger';
import type { ContextUse } from '@stateforge-labs/session-ledger';
import type { ContextObserved as Observed } from '@stateforge-labs/session-ledger';
import { windowOfAgent } from '#src/adapters/capability/context-window.ts';
import { countOf } from '@stateforge-labs/session-ledger';
import { textOf } from '@stateforge-labs/session-ledger';

const use = (tokens: number): ContextUse => ({ tokens: countOf(tokens), window: countOf(200_000), source: 'agent' });
const context = (observed: Observed, kind: string, setting: number | null, catalogued: number | null): ContextUse | null => contextOf(
    { observed, setting: setting === null ? null : countOf(setting) },
    windowOfAgent(kindOf(kind), { windowOf: () => (catalogued === null ? null : countOf(catalogued)) }),
);

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
