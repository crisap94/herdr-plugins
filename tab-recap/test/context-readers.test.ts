import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalCatalogue } from '#src/adapters/model-catalogue.ts';
import { claudeObserved, codexObserved } from '#src/adapters/context-rows.ts';
import { OpencodeTranscripts } from '#src/adapters/opencode-transcripts.ts';
import { opencodeFixture } from '#test/opencode-fixture.ts';

const line = (row: object): string => JSON.stringify(row);

const assistant = (model: string, usage: object, extra: object = {}): string => line({ type: 'assistant', isSidechain: false, message: { model, role: 'assistant', content: [], usage }, ...extra });

test('claude: the newest assistant usage is input + cache read + cache creation; sidechains and synthetic rows are ignored; a compaction raises the peak', () => {
    const found = claudeObserved([
        line({ type: 'system', subtype: 'compact_boundary', compactMetadata: { trigger: 'manual', preTokens: 554_888, postTokens: 13_205 } }),
        assistant('claude-opus-5-5', { input_tokens: 2, cache_creation_input_tokens: 876, cache_read_input_tokens: 61_646, output_tokens: 357 }),
        assistant('claude-haiku-4-5', { input_tokens: 9, cache_read_input_tokens: 500 }, { isSidechain: true }),
        assistant('<synthetic>', { input_tokens: 0 }),
        'not json at all',
    ]);
    assert.deepEqual(found, { tokens: 62_524, peak: 554_888, window: null, model: 'claude-opus-5-5' });
    assert.equal(claudeObserved([line({ type: 'user', message: { content: 'hi' } })]), null);
});

const used = (read: number): object => ({ providerID: 'acme', modelID: 'big-1', tokens: { input: 5, output: 5, cache: { read, write: 0 } } });

test('claude: a compaction row\'s postTokens is the use until a newer usage row (431 387 → compaction 12 332 → 1 %)', () => {
    const before = assistant('claude-opus-5-5', { input_tokens: 3, cache_read_input_tokens: 431_384 });
    const compaction = line({ type: 'system', subtype: 'compact_boundary', compactMetadata: { trigger: 'manual', preTokens: 431_635, postTokens: 12_332 } });
    assert.deepEqual(claudeObserved([before, compaction]), { tokens: 12_332, peak: 431_635, window: null, model: 'claude-opus-5-5' });
    assert.deepEqual(claudeObserved([compaction]), { tokens: 12_332, peak: 431_635, window: null, model: null });
    assert.equal(claudeObserved([before, line({ type: 'system', subtype: 'compact_boundary', compactMetadata: { trigger: 'auto', preTokens: 5 } })])?.tokens, 431_387);
    assert.equal(claudeObserved([before, compaction, assistant('claude-opus-5-5', { input_tokens: 1, cache_read_input_tokens: 20_000 })])?.tokens, 20_001);
});

test('codex: a compacted row changes nothing by itself; the token_count after it is the use (pinned)', () => {
    const count = (total: number): string => line({ type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { total_tokens: total }, model_context_window: 258_400 } } });
    const compacted = line({ type: 'compacted', payload: { message: '' } });
    assert.equal(codexObserved([count(200_000), compacted])?.tokens, 200_000);
    assert.equal(codexObserved([count(200_000), compacted, count(14_000)])?.tokens, 14_000);
});

test('opencode: the compaction answer is the newest assistant message, so its tokens are the use (pinned)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'recap-context-'));
    try {
        const fixture = opencodeFixture(dir);
        fixture.add({ id: 'm1', session: 'ses_c', role: 'assistant', updated: 1, parts: [], data: used(90_000) });
        fixture.add({ id: 'm2', session: 'ses_c', role: 'assistant', updated: 2, parts: [], data: used(8_000) });
        assert.equal(((await new OpencodeTranscripts(fixture.db).observed(`${fixture.db}#ses_c`)) as { observed: { tokens: number } }).observed.tokens, 8_005);
        fixture.close();
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('codex: the newest token_count (last request total, the model window) and the model of the newest turn', () => {
    const count = (total: number, window: number): string => line({ type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { total_tokens: total * 3 }, last_token_usage: { total_tokens: total }, model_context_window: window }, rate_limits: {} } });
    assert.deepEqual(codexObserved([line({ type: 'turn_context', payload: { model: 'gpt-6-luna' } }), count(13_932, 258_400), count(116_000, 258_400)]), { tokens: 116_000, peak: 116_000, window: 258_400, model: 'gpt-6-luna' });
    assert.equal(codexObserved([line({ type: 'event_msg', payload: { type: 'task_started' } })]), null);
    assert.equal(codexObserved([line({ type: 'event_msg', payload: { type: 'token_count', info: null } })]), null);
});

test('opencode: the newest assistant message with tokens, as provider/model', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'recap-context-'));
    try {
        const fixture = opencodeFixture(dir);
        fixture.add({ id: 'm1', session: 'ses_new', role: 'assistant', updated: 1, parts: [], data: { providerID: 'acme', modelID: 'big-1', tokens: { input: 10, output: 5, cache: { read: 1000, write: 20 } } } });
        fixture.add({ id: 'm2', session: 'ses_new', role: 'assistant', updated: 2, parts: [], data: { providerID: 'acme', modelID: 'big-1', tokens: { input: 0, output: 0, cache: { read: 0, write: 0 } } } });
        fixture.add({ id: 'm3', session: 'ses_new', role: 'user', updated: 3, parts: [] });
        const reader = new OpencodeTranscripts(fixture.db);
        assert.deepEqual(await reader.observed(`${fixture.db}#ses_new`), { kind: 'observed', observed: { tokens: 1030, peak: 1030, window: null, model: 'acme/big-1' } });
        assert.deepEqual(await reader.observed(`${fixture.db}#ses_old`), { kind: 'observed', observed: null });
        fixture.close();
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('the local catalogue: provider/model, a bare id (anthropic first), [1m] stripped, unknown and a missing file are null', () => {
    const dir = mkdtempSync(join(tmpdir(), 'recap-catalogue-'));
    try {
        const file = join(dir, 'models.json');
        writeFileSync(file, JSON.stringify({
            anthropic: { id: 'anthropic', models: { 'claude-opus-5-5': { limit: { context: 1_000_000, output: 64_000 } }, 'claude-haiku-4-5': { limit: { context: 200_000 } } } },
            acme: { id: 'acme', models: { 'big-1': { limit: { context: 128_000 } }, 'claude-haiku-4-5': { limit: { context: 99 } }, empty: {} } },
        }));
        const catalogue = new LocalCatalogue(file);
        assert.equal(catalogue.windowOf('acme/big-1'), 128_000);
        assert.equal(catalogue.windowOf('claude-opus-5-5'), 1_000_000);
        assert.equal(catalogue.windowOf('claude-opus-5-5[1m]'), 1_000_000);
        assert.equal(catalogue.windowOf('claude-haiku-4-5'), 200_000, 'anthropic is asked first');
        assert.equal(catalogue.windowOf('big-1'), 128_000, 'a bare id is looked for in every provider');
        assert.equal(catalogue.windowOf('acme/empty'), null);
        assert.equal(catalogue.windowOf('nobody/nothing'), null);
        assert.equal(new LocalCatalogue(join(dir, 'missing.json')).windowOf('acme/big-1'), null);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
