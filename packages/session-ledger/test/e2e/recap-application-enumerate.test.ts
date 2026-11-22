import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ASK_BACK_CHARS, deduplicated, enumerate, enumerateAsked } from '@stateforge-labs/session-ledger/unstable/recap/application/enumerate.ts';
import type { AgentTurns, EnumerateRun } from '@stateforge-labs/session-ledger/unstable/recap/application/enumerate.ts';
import { correctionDocument } from '@stateforge-labs/session-ledger/unstable/recap/application/correction-input.ts';
import type { Enumerators, Enumerated } from '@stateforge-labs/session-ledger/unstable/ports/enumerators.ts';
import type { InputCandidate, RecapInput } from '@stateforge-labs/session-ledger/unstable/ports/legacy.ts';
import { brand } from '@stateforge-labs/session-ledger/unstable/recap/domain/brand.ts';
import { instant } from '@stateforge-labs/session-ledger/unstable/recap/domain/time.ts';
import type { Correction } from '@stateforge-labs/session-ledger/unstable/ports/legacy.ts';

const textOf = brand<string, 'Text'>;
const count = brand<number, 'Count'>;
const usd = brand<number, 'Usd'>;

const NOW = 1_700_000_000_000;

const candidate = (text: string, flagged: boolean): InputCandidate => ({ section: 'next', text, why: null, ref: null, at: null, anchor: text, agent: 'claude', flagged });

const silentEnumerator = (): Enumerators => ({
    backend: textOf('fake'),
    job: textOf('enumerate'),
    write: async (): Promise<Enumerated> => ({ kind: 'unknown', why: { why: 'not-found', what: 'model' } }),
});

const run = (enumerator: Enumerators): EnumerateRun => ({
    enumerator,
    language: textOf('en'),
    tab: { id: textOf('tab-1'), now: instant(NOW), zone: textOf('UTC') },
    log: () => undefined,
});

const turns: readonly AgentTurns[] = [{ agent: textOf('claude'), entries: [{ role: 'user', text: 'Fix the CI' }] }];

test('duplicates keep the first candidate and a model candidate replaces a flagged twin', () => {
    const flagged = candidate('Ship the parser fix', true);
    const modelled = candidate('Ship the parser fix', false);
    assert.deepEqual(deduplicated([flagged, modelled]), [modelled]);
    assert.deepEqual(deduplicated([modelled, flagged]), [modelled]);
});

test('the ask-back window is 24000 characters', () => {
    assert.equal(ASK_BACK_CHARS, 24_000);
});

test('enumerate reports a failed backend and keeps no candidates', async () => {
    const result = await enumerate(run(silentEnumerator()), turns);
    assert.deepEqual(result.candidates, []);
    assert.equal(result.failed, 'fake gave none (model not found)');
});

test('enumerate with no turns makes no calls and reports no failure', async () => {
    const result = await enumerate(run(silentEnumerator()), []);
    assert.deepEqual(result, { candidates: [], cost: usd(0), chunks: count(0), chars: count(0), failed: null });
});

test('enumerateAsked with no turns has no candidates and no failure', async () => {
    const result = await enumerateAsked(run(silentEnumerator()), [], []);
    assert.deepEqual(result, { candidates: [], cost: usd(0), chunks: count(1), chars: count(0), failed: null });
});

test('enumerateAsked reports a failed backend on the newest turns', async () => {
    const result = await enumerateAsked(run(silentEnumerator()), turns, []);
    assert.equal(result.failed, 'fake gave none (model not found)');
});

test('the correction document names the tab, the problems and the refused operations', () => {
    const input: RecapInput = {
        tab: { id: 'tab-1', now: NOW, zone: 'UTC' },
        agents: [],
        tasks: [],
        ledgers: [],
        notes: [],
        transcripts: [],
    };
    const retry: Correction = { refused: [], problems: ['the fact id is unknown'], facts: [], tasks: false };
    const document = correctionDocument({ input, language: 'en', previousLanguage: 'en', retry });
    assert.match(document, /<correction_input/);
    assert.match(document, /<tab id="tab-1"/);
    assert.match(document, /the fact id is unknown/);
});
