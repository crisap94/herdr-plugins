import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WINDOW_SIZES, windowOfKind } from '#src/adapters/context-window.ts';
import { contextOf } from '#src/recap/domain/compaction.ts';
import type { Observed } from '#src/recap/domain/compaction.ts';
import type { ModelCatalogue } from '#src/ports/model-catalogue.ts';

const seen = (model: string | null, window: number | null = null, tokens = 90_000, peak = tokens): Observed => ({ model, window, tokens, peak });

interface Row {
    readonly name: string;
    readonly kind: string;
    readonly observed: Observed;
    readonly setting: number | null;
    readonly catalogued: number | null;
    readonly expected: { readonly tokens: number; readonly window: number; readonly source: 'agent' | 'catalogue' | 'table' | 'observed' | 'setting' } | null;
}

const rows: readonly Row[] = [
    { name: 'the catalogue is injected for Claude ahead of its family table', kind: 'claude', observed: seen('claude-opus-4-5'), setting: null, catalogued: 128_000, expected: { tokens: 90_000, window: 128_000, source: 'catalogue' } },
    { name: 'Claude [1m] model suffix', kind: 'claude', observed: seen('claude-sonnet-4-5[1m]'), setting: null, catalogued: null, expected: { tokens: 90_000, window: 1_000_000, source: 'table' } },
    { name: 'Claude Opus 4.5', kind: 'claude', observed: seen('claude-opus-4-5'), setting: null, catalogued: null, expected: { tokens: 90_000, window: 200_000, source: 'table' } },
    { name: 'Claude Sonnet 4.5', kind: 'claude', observed: seen('claude-sonnet-4-5'), setting: null, catalogued: null, expected: { tokens: 90_000, window: 200_000, source: 'table' } },
    { name: 'Claude Opus 4.6', kind: 'claude', observed: seen('claude-opus-4-6'), setting: null, catalogued: null, expected: { tokens: 90_000, window: 1_000_000, source: 'table' } },
    { name: 'Claude Sonnet 4.6', kind: 'claude', observed: seen('claude-sonnet-4-6'), setting: null, catalogued: null, expected: { tokens: 90_000, window: 1_000_000, source: 'table' } },
    { name: 'Claude Opus 5', kind: 'claude', observed: seen('claude-opus-5-5'), setting: null, catalogued: null, expected: { tokens: 90_000, window: 1_000_000, source: 'table' } },
    { name: 'Claude Sonnet 5', kind: 'claude', observed: seen('claude-sonnet-5-5'), setting: null, catalogued: null, expected: { tokens: 90_000, window: 1_000_000, source: 'table' } },
    { name: 'unknown Claude model', kind: 'claude', observed: seen('mystery'), setting: null, catalogued: null, expected: { tokens: 90_000, window: 200_000, source: 'table' } },
    { name: 'Codex uses its observed window', kind: 'codex', observed: seen('gpt-6-luna', 258_400), setting: null, catalogued: null, expected: { tokens: 90_000, window: 258_400, source: 'agent' } },
    { name: 'OpenCode uses its injected catalogue', kind: 'opencode', observed: seen('acme/model'), setting: null, catalogued: 128_000, expected: { tokens: 90_000, window: 128_000, source: 'catalogue' } },
    { name: 'an explicit setting wins', kind: 'claude', observed: seen('claude-opus-4-5'), setting: 500_000, catalogued: 128_000, expected: { tokens: 90_000, window: 500_000, source: 'setting' } },
    { name: 'peak usage raises a smaller window by the shared size ladder', kind: 'claude', observed: seen('claude-opus-4-5', null, 30_000, 554_888), setting: null, catalogued: 200_000, expected: { tokens: 30_000, window: 1_000_000, source: 'observed' } },
    { name: 'usage above the size ladder remains exact', kind: 'opencode', observed: seen('acme/model', null, 1_200_000), setting: null, catalogued: 128_000, expected: { tokens: 1_200_000, window: 1_200_000, source: 'observed' } },
    { name: 'an unknown kind has no context window', kind: 'gemini', observed: seen('unknown'), setting: null, catalogued: null, expected: null },
];

test('registered context window sources preserve the pre-migration values', () => {
    for (const row of rows) {
        const catalogue: ModelCatalogue = { windowOf: () => row.catalogued };
        assert.deepEqual(contextOf({ observed: row.observed, setting: row.setting }, windowOfKind(row.kind, catalogue), WINDOW_SIZES), row.expected, row.name);
    }
});
