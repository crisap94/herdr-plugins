import { textOf } from '@stateforge-labs/session-ledger/unstable/recap/domain/text.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CLOSED_SHOWN_MS, numbered, severalOf, taskFactsOf, writerFacts } from '@stateforge-labs/session-ledger/unstable/recap/application/ledger-input.ts';
import { isoSecond, localTime } from '@stateforge-labs/session-ledger/unstable/recap/application/local-time.ts';
import { FULL_WRITER_VIEW } from '@stateforge-labs/session-ledger/unstable/recap/domain/writer-view.ts';
import { TRANSCRIPT_BUDGET, writerContext } from '@stateforge-labs/session-ledger/unstable/recap/application/writer-context.ts';
import { brand } from '@stateforge-labs/session-ledger/unstable/recap/domain/brand.ts';
import { instant } from '@stateforge-labs/session-ledger/unstable/recap/domain/time.ts';
import type { RecapInput } from '@stateforge-labs/session-ledger/unstable/ports/recap-input.ts';
import type { RecapRequest } from '@stateforge-labs/session-ledger/unstable/ports/summarizer.ts';

const text = brand<string, 'Text'>;
const count = brand<number, 'Count'>;

const NOW = 1_700_000_000_000;

const input: RecapInput = {
    tab: { id: textOf('tab-1'), now: instant(NOW), zone: textOf('UTC') },
    agents: [],
    tasks: [],
    ledgers: [],
    notes: [{ agent: textOf('claude'), kind: 'compaction', at: null, text: textOf('Build is green') }],
    transcripts: [{ agent: textOf('claude'), entries: [{ role: 'user', text: textOf('Fix the CI') }] }],
};

const request: RecapRequest = { input, language: textOf('en'), previousLanguage: textOf('en') };

test('the writer context carries the transcript and notes within the default budget', () => {
    const context = writerContext(request);
    assert.equal(TRANSCRIPT_BUDGET, 60_000);
    assert.match(context, /Fix the CI/);
    assert.match(context, /Build is green/);
});

test('a tiny budget trims the writer context below the full context', () => {
    assert.ok(writerContext(request, count(1)).length < writerContext(request).length);
});

test('ISO seconds drop the milliseconds and keep the Z suffix', () => {
    assert.equal(isoSecond(instant(NOW)), '2023-11-14T22:13:20Z');
});

test('local time shows the clock alone on the same day and the date otherwise', () => {
    assert.equal(localTime(instant(NOW), instant(NOW), text('UTC')), '22:13');
    assert.equal(localTime(instant(NOW - 2 * 86_400_000), instant(NOW), text('UTC')), '2023-11-12 22:13');
});

test('closed facts are shown for two hours and task facts keep the open and closed lists', () => {
    assert.equal(CLOSED_SHOWN_MS, 2 * 3_600_000);
    const task = { key: 'T-1' } as Parameters<typeof taskFactsOf>[1];
    const ledger = {
        openOf: () => [],
        recentlyClosed: () => [],
    } as unknown as Parameters<typeof taskFactsOf>[0];
    assert.deepEqual(taskFactsOf(ledger, task, instant(NOW)), { key: text('T-1'), open: [], closed: [] });
});

test('writer facts and numbering come through with an empty ledger', () => {
    assert.deepEqual(writerFacts([], FULL_WRITER_VIEW, instant(NOW)).shown, []);
    assert.equal(numbered([], [], severalOf(false), FULL_WRITER_VIEW, instant(NOW)).byId.size, 0);
});
