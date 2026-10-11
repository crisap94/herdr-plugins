import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshnessOf } from '#src/recap/application/freshness-block.ts';
import type { FreshnessInput } from '#src/recap/application/freshness-block.ts';
import { TRANSCRIPT_READ_BUDGET_BYTES } from '#src/recap/application/transcript-read-budget.ts';
import { registryWith } from './fakes/transcript-registry.ts';
import type { LaneCursor, LastRun, RecapRecords } from '#src/ports/recap-records.ts';
import { UNREAD } from '#src/ports/transcripts.ts';
import type { ChunkResult, Entry, Position, Transcripts } from '#src/ports/transcripts.ts';
import { unknown } from '#src/ports/unknowable.ts';
import { SCREEN_PREFIX } from '#src/ports/screens.ts';

const TAB = 'w1:t1';
const LAST: LastRun = { at: 1_000, cause: 'turn-ended' };
const records = (last: LastRun | null): Pick<RecapRecords, 'lastRunOf'> => ({ lastRunOf: () => last });

interface Asked {
    readonly source: string;
    readonly was: Position;
    readonly budget: number;
}

function reader(entries: readonly Entry[] | null, asked: Asked[] = []): Transcripts {
    return {
        agent: 'claude',
        inFlight: { kind: 'unsupported', why: 'unregistered-reader' },
        locate: () => Promise.resolve(unknown({ why: 'not-found', what: 'x' })),
        latestPrompt: () => Promise.resolve({ kind: 'prompt', text: null }),
        read: (source, was, budget): Promise<ChunkResult> => {
            asked.push({ source, was, budget });
            return Promise.resolve(entries === null ? unknown({ why: 'unreadable', detail: source }) : { kind: 'chunk', entries, title: null, lastPrompt: null, claudeRecap: null, notes: [], position: { cursor: 99, tail: null }, grew: true });
        },
    };
}

const user = (text: string): Entry => ({ role: 'user', text });
const agent = (text: string): Entry => ({ role: 'agent', text });
const tool = (text: string): Entry => ({ role: 'tool', text, kind: 'edit' });

const input = (overrides: Partial<FreshnessInput> = {}): FreshnessInput => ({
    tab: TAB, agent: 'claude', source: 'session-a.jsonl', cursor: null, status: 'idle', refresh: 'not-requested', ...overrides,
});

const cursorAt = (transcript: string, cursor: number, tail: string | null = null): LaneCursor => ({
    pane: 'w1:p1', agent: 'claude', transcript, cursor, tail, title: null, lastPrompt: null, claudeRecap: null,
});

test('a tab with no good run is the ledger-empty outcome, whatever the transcript holds', async () => {
    const outcome = await freshnessOf({ records: records(null), transcripts: registryWith({ claude: reader([user('hi')]) }) }, input());
    assert.deepEqual(outcome, { kind: 'ledger-empty' });
});

test('the Freshness block carries the last good run, the status and the refresh result', async () => {
    const outcome = await freshnessOf({ records: records(LAST), transcripts: registryWith({ claude: reader([]) }) }, input({ status: 'working', refresh: 'refreshed' }));
    assert.deepEqual(outcome, {
        kind: 'fresh', freshness: { lastRun: LAST, status: 'working', newerPrompts: { kind: 'none' }, refresh: 'refreshed' },
    });
});

test('newer prompts: the user prompts after the cursor are counted as at least N', async () => {
    const outcome = await freshnessOf({ records: records(LAST), transcripts: registryWith({ claude: reader([agent('a'), user('one'), tool('edit'), user('two'), user('three')]) }) }, input({ cursor: cursorAt('session-a.jsonl', 40, 'tail') }));
    assert.equal(outcome.kind, 'fresh');
    assert.deepEqual(outcome.freshness.newerPrompts, { kind: 'at-least', count: 3 });
});

test('newer prompts: a queued prompt is a user prompt and counts as one', async () => {
    const outcome = await freshnessOf({ records: records(LAST), transcripts: registryWith({ claude: reader([agent('a'), { role: 'user', text: 'later', queued: true }]) }) }, input({ cursor: cursorAt('session-a.jsonl', 40, 'tail') }));
    assert.equal(outcome.kind, 'fresh');
    assert.deepEqual(outcome.freshness.newerPrompts, { kind: 'at-least', count: 1 });
});

test('newer prompts: a transcript that grew with agent output only is none', async () => {
    const outcome = await freshnessOf({ records: records(LAST), transcripts: registryWith({ claude: reader([agent('a'), tool('b')]) }) }, input());
    assert.equal(outcome.kind, 'fresh');
    assert.deepEqual(outcome.freshness.newerPrompts, { kind: 'none' });
});

test('newer prompts: a transcript that cannot be read is unknown, and the lane is still reported', async () => {
    const outcome = await freshnessOf({ records: records(LAST), transcripts: registryWith({ claude: reader(null) }) }, input());
    assert.equal(outcome.kind, 'fresh');
    assert.deepEqual(outcome.freshness.newerPrompts, { kind: 'unknown' });
    assert.equal(outcome.freshness.status, 'idle');
});

test('newer prompts: a source with no reader, no source or a screen source is unknown, and nothing is read', async () => {
    const asked: Asked[] = [];
    const transcripts = registryWith({ claude: reader([user('x')], asked) });
    const noReader = await freshnessOf({ records: records(LAST), transcripts }, input({ agent: 'zed' }));
    const noSource = await freshnessOf({ records: records(LAST), transcripts }, input({ source: null }));
    const screen = await freshnessOf({ records: records(LAST), transcripts }, input({ source: `${SCREEN_PREFIX}w1:p1` }));
    for (const outcome of [noReader, noSource, screen]) {
        assert.equal(outcome.kind, 'fresh');
        assert.deepEqual(outcome.freshness.newerPrompts, { kind: 'unknown' });
    }
    assert.deepEqual(asked, []);
});

test('the cursor applies only while the stored transcript equals the source', async () => {
    const asked: Asked[] = [];
    const transcripts = registryWith({ claude: reader([], asked) });
    await freshnessOf({ records: records(LAST), transcripts }, input({ cursor: cursorAt('session-a.jsonl', 40, 'tail') }));
    await freshnessOf({ records: records(LAST), transcripts }, input({ cursor: cursorAt('session-old.jsonl', 40, 'tail') }));
    await freshnessOf({ records: records(LAST), transcripts }, input({ cursor: null }));
    assert.deepEqual(asked.map((call) => call.was), [{ cursor: 40, tail: 'tail' }, UNREAD, UNREAD]);
    assert.ok(asked.every((call) => call.budget === TRANSCRIPT_READ_BUDGET_BYTES));
});

test('the located source is the one read, so the daemon and the CLI share one function', async () => {
    const asked: Asked[] = [];
    await freshnessOf({ records: records(LAST), transcripts: registryWith({ claude: reader([], asked) }) }, input({ source: 'located.jsonl' }));
    assert.deepEqual(asked.map((call) => call.source), ['located.jsonl']);
});

