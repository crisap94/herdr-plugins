import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { windowOfAgent } from '#src/adapters/capability/context-window.ts';
import { CatalogueWindows } from '#src/adapters/capability/catalogue.ts';
import { compactionPlanner } from '#src/adapters/capability/compaction-plans.ts';
import { claudeWindowFor } from '#src/adapters/capability/context-window.ts';
import { kindOf, pathOrNull } from '#test/fakes/agent-kind.ts';
import { GitWorksite } from '#src/adapters/git/worksite.ts';
import { commitFiles, makeRepo, scratch } from './fixtures/git-repo.ts';
import { contextOf } from '@stateforge-labs/session-ledger';
import type { ContextObserved as Observed } from '@stateforge-labs/session-ledger';
import type { ModelWindows } from '#src/ports/model-catalogue.ts';
import { countOf } from '@stateforge-labs/session-ledger';
import { textOf } from '@stateforge-labs/session-ledger';

const seen = (model: string | null, window: number | null = null, tokens = 90_000, peak = tokens): Observed => ({ model: model === null ? null : textOf(model), window: window === null ? null : countOf(window), tokens: countOf(tokens), peak: countOf(peak) });

test('an unregistered screen kind has no context window basis without a stated window, and keeps its stated window', () => {
    const catalogue: ModelWindows = { windowOf: () => null };
    const observed: Observed = { tokens: countOf(1), peak: countOf(1), window: countOf(50), model: null };
    assert.equal(windowOfAgent(kindOf('gemini'), catalogue)({ ...observed, window: null }), null);
    assert.deepEqual(windowOfAgent(kindOf('gemini'), catalogue)(observed), { window: 50, source: 'agent', sizes: [] });
});

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
    { name: 'Claude Haiku 4.5', kind: 'claude', observed: seen('claude-haiku-4-5'), setting: null, catalogued: null, expected: { tokens: 90_000, window: 200_000, source: 'table' } },
    { name: 'dated Claude Opus 4.5', kind: 'claude', observed: seen('claude-opus-4-5-20251101'), setting: null, catalogued: null, expected: { tokens: 90_000, window: 200_000, source: 'table' } },
    { name: 'dated Claude Opus 4 model', kind: 'claude', observed: seen('claude-opus-4-20250514'), setting: null, catalogued: null, expected: { tokens: 90_000, window: 200_000, source: 'table' } },
    { name: 'Claude Opus 4.7', kind: 'claude', observed: seen('claude-opus-4-7'), setting: null, catalogued: null, expected: { tokens: 90_000, window: 1_000_000, source: 'table' } },
    { name: 'Claude Sonnet 4.5', kind: 'claude', observed: seen('claude-sonnet-4-5'), setting: null, catalogued: null, expected: { tokens: 90_000, window: 200_000, source: 'table' } },
    { name: 'Claude Opus 4.6', kind: 'claude', observed: seen('claude-opus-4-6'), setting: null, catalogued: null, expected: { tokens: 90_000, window: 1_000_000, source: 'table' } },
    { name: 'Claude Sonnet 4.6', kind: 'claude', observed: seen('claude-sonnet-4-6'), setting: null, catalogued: null, expected: { tokens: 90_000, window: 1_000_000, source: 'table' } },
    { name: 'Claude Opus 5', kind: 'claude', observed: seen('claude-opus-5-5'), setting: null, catalogued: null, expected: { tokens: 90_000, window: 1_000_000, source: 'table' } },
    { name: 'Claude Sonnet 5', kind: 'claude', observed: seen('claude-sonnet-5-5'), setting: null, catalogued: null, expected: { tokens: 90_000, window: 1_000_000, source: 'table' } },
    { name: 'unknown Claude model', kind: 'claude', observed: seen('mystery'), setting: null, catalogued: null, expected: { tokens: 90_000, window: 200_000, source: 'table' } },
    { name: 'Codex uses its observed window', kind: 'codex', observed: seen('gpt-6-luna', 258_400), setting: null, catalogued: null, expected: { tokens: 90_000, window: 258_400, source: 'agent' } },
    { name: 'Codex over its observed window uses the exact observed peak', kind: 'codex', observed: seen('gpt-6-luna', 258_400, 300_000), setting: null, catalogued: null, expected: { tokens: 300_000, window: 300_000, source: 'observed' } },
    { name: 'Codex inside its observed window keeps the stated window', kind: 'codex', observed: seen('gpt-6-luna', 258_400, 200_000), setting: null, catalogued: null, expected: { tokens: 200_000, window: 258_400, source: 'agent' } },
    { name: 'Claude stated window precedes a different family-table value', kind: 'claude', observed: seen('claude-opus-4-5', 350_000), setting: null, catalogued: null, expected: { tokens: 90_000, window: 350_000, source: 'agent' } },
    { name: 'Codex falls back to the catalogue', kind: 'codex', observed: seen('gpt-6-luna'), setting: null, catalogued: 258_400, expected: { tokens: 90_000, window: 258_400, source: 'catalogue' } },
    { name: 'Codex without a stated window or catalogue entry', kind: 'codex', observed: seen('unknown'), setting: null, catalogued: null, expected: null },
    { name: 'OpenCode uses its injected catalogue', kind: 'opencode', observed: seen('acme/model'), setting: null, catalogued: 128_000, expected: { tokens: 90_000, window: 128_000, source: 'catalogue' } },
    { name: 'OpenCode over its catalogue window uses the exact observed peak', kind: 'opencode', observed: seen('acme/model', null, 150_000), setting: null, catalogued: 128_000, expected: { tokens: 150_000, window: 150_000, source: 'observed' } },
    { name: 'an explicit setting wins', kind: 'claude', observed: seen('claude-opus-4-5'), setting: 500_000, catalogued: 128_000, expected: { tokens: 90_000, window: 500_000, source: 'setting' } },
    { name: 'Claude peak usage raises a smaller window by its size ladder', kind: 'claude', observed: seen('claude-opus-4-5', null, 30_000, 554_888), setting: null, catalogued: 200_000, expected: { tokens: 30_000, window: 1_000_000, source: 'observed' } },
    { name: 'usage above the size ladder remains exact', kind: 'opencode', observed: seen('acme/model', null, 1_200_000), setting: null, catalogued: 128_000, expected: { tokens: 1_200_000, window: 1_200_000, source: 'observed' } },
    { name: 'an unknown kind has no context window', kind: 'gemini', observed: seen('unknown'), setting: null, catalogued: null, expected: null },
    { name: 'an unregistered kind uses a stated window', kind: 'gemini', observed: seen('unknown', 258_400), setting: null, catalogued: null, expected: { tokens: 90_000, window: 258_400, source: 'agent' } },
    { name: 'an unregistered kind falls back to the catalogue', kind: 'gemini', observed: seen('unknown'), setting: null, catalogued: 128_000, expected: { tokens: 90_000, window: 128_000, source: 'catalogue' } },
    { name: 'an unregistered kind over its stated window uses the exact observed peak', kind: 'gemini', observed: seen('unknown', 258_400, 300_000), setting: null, catalogued: null, expected: { tokens: 300_000, window: 300_000, source: 'observed' } },
    { name: 'constructor follows the unregistered path', kind: 'constructor', observed: seen('unknown', 258_400), setting: null, catalogued: null, expected: { tokens: 90_000, window: 258_400, source: 'agent' } },
];

for (const row of rows) {
    test(row.name, () => {
        const catalogue: ModelWindows = { windowOf: () => (row.catalogued === null ? null : countOf(row.catalogued)) };
        assert.deepEqual(contextOf({ observed: row.observed, setting: row.setting === null ? null : countOf(row.setting) }, windowOfAgent(kindOf(row.kind), catalogue)), row.expected, row.name);
    });
}

const seenOf = (model: string | null): Observed => ({ model: model === null ? null : textOf(model), window: null, tokens: countOf(1), peak: countOf(1) });

test('compaction with empty guidance still plans the bare command', () => {
    const result = compactionPlanner.forKind(kindOf('claude'), textOf(''));
    assert.equal(result.kind, 'supported');
    assert.equal('plan' in result ? result.plan.lines.length : 0, 1);
    assert.equal(compactionPlanner.forKind(kindOf('codex'), textOf('')).kind, 'supported');
});

test('an unknown or blank kind is still unsupported with its wording', () => {
    assert.equal(compactionPlanner.forKind(kindOf(''), textOf('')).kind, 'unsupported');
    assert.equal(compactionPlanner.forKind(kindOf('gemini'), textOf('x')).kind, 'unsupported');
});

test('a catalogue window that is zero or fractional reaches the basis unchanged', () => {
    for (const window of [0, 1000.5]) {
        const catalogue: ModelWindows = { windowOf: () => countOf(window) };
        assert.deepEqual(windowOfAgent(kindOf('opencode'), catalogue)(seenOf('m')), { window, source: 'catalogue', sizes: [] });
        assert.equal(claudeWindowFor(catalogue)(seenOf('m'))?.window, window);
    }
});

test('the local catalogue returns a fractional window and tolerates a blank file name', () => {
    const dir = scratch('catalogue-');
    try {
        const file = join(dir.root, 'models.json');
        writeFileSync(file, JSON.stringify({ anthropic: { models: { m: { limit: { context: 1000.5 } } } } }));
        assert.equal(new CatalogueWindows(pathOrNull(file)).windowOf(textOf('m')), 1000.5);
        assert.equal(new CatalogueWindows(pathOrNull('   ')).windowOf(textOf('m')), null);
        assert.equal(new CatalogueWindows(pathOrNull('')).windowOf(textOf('m')), null);
    } finally {
        dir.clean();
    }
});

test('a commit with an empty subject is still a commit, and a blank directory is not found', async () => {
    const repo = await makeRepo('legacy-empty-subject-', { 'a.txt': 'x\n' });
    try {
        const reader = new GitWorksite();
        await commitFiles(repo.root, { 'b.txt': 'y\n' }, '\n');
        const found = await reader.lastCommit(textOf(repo.root));
        assert.equal(found.kind, 'commit');
        assert.equal('subject' in found ? found.subject : null, '');
        assert.deepEqual(await reader.lastCommit(textOf('')), { kind: 'unknown', why: { why: 'not-found', what: 'directory' } });
    } finally {
        repo.clean();
    }
});
