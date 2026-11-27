import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshnessOf } from '#src/recap/application/freshness-block.ts';
import type { FreshnessInput } from '#src/recap/application/freshness-block.ts';
import { registryWith } from './fakes/transcript-registry.ts';
import type { LastRun } from '@stateforge-labs/session-ledger';
import type { LegacyRecords as Records } from '@stateforge-labs/session-ledger';
import { cursorOf, grewOf } from '@stateforge-labs/session-ledger';
import type { ChunkResult, Entry, Position } from '@stateforge-labs/session-ledger';
import type { LegacySessionReader as SessionReader } from '@stateforge-labs/session-ledger';
import { unknown } from '@stateforge-labs/session-ledger';
import { causeOf } from './fakes/cause.ts';
import { SCREEN_PREFIX } from '#src/ports/screens.ts';
import { textOf } from '@stateforge-labs/session-ledger';
import { agentKind, tabId } from '#test/support/ids.ts';
import { instant } from '@stateforge-labs/session-ledger';
import { fsPathOf } from '#src/recap/domain/fs-path.ts';

const TAB = tabId('w1:t1');
const LAST: LastRun = { at: instant(1_000), cause: 'turn-ended' };
const records = (last: LastRun | null): Pick<Records, 'lastRunOf'> => ({ lastRunOf: () => last });

interface Asked {
    readonly source: string;
    readonly was: Position;
    readonly budget: number;
}

function reader(entries: readonly Entry[] | null, asked: Asked[] = []): SessionReader {
    return {
        agent: agentKind('claude'),
        inFlight: { kind: 'unsupported', why: 'unregistered-reader' },
        locate: () => Promise.resolve(unknown({ why: 'not-found', what: textOf('x') })),
        latestPrompt: () => Promise.resolve({ kind: 'prompt', text: null }),
        read: (source, was, budget): Promise<ChunkResult> => {
            asked.push({ source, was, budget });
            return Promise.resolve(entries === null ? unknown({ why: 'unreadable', detail: causeOf(source) }) : { kind: 'chunk', entries, title: null, lastPrompt: null, harnessRecap: null, notes: [], position: { cursor: cursorOf(99), tail: null }, grew: grewOf(true) });
        },
    };
}

const user = (text: string): Entry => ({ role: 'user', text: textOf(text) });

const input = (overrides: Partial<FreshnessInput> = {}): FreshnessInput => ({
    tab: TAB, agent: agentKind('claude'), source: fsPathOf('session-a.jsonl'), cursor: null, status: 'idle', refresh: 'not-requested', ...overrides,
});

test('newer prompts: a transcript that cannot be read is unknown, and the lane is still reported', async () => {
    const outcome = await freshnessOf({ unreported: () => undefined, records: records(LAST), transcripts: registryWith({ claude: reader(null) }) }, input());
    assert.equal(outcome.kind, 'fresh');
    assert.deepEqual(outcome.freshness.newerPrompts, { kind: 'unknown' });
    assert.equal(outcome.freshness.status, 'idle');
});

test('newer prompts: a source with no reader, no source or a screen source is unknown, and nothing is read', async () => {
    const asked: Asked[] = [];
    const transcripts = registryWith({ claude: reader([user('x')], asked) });
    const noReader = await freshnessOf({ unreported: () => undefined, records: records(LAST), transcripts }, input({ agent: agentKind('zed') }));
    const noSource = await freshnessOf({ unreported: () => undefined, records: records(LAST), transcripts }, input({ source: null }));
    const screen = await freshnessOf({ unreported: () => undefined, records: records(LAST), transcripts }, input({ source: fsPathOf(`${SCREEN_PREFIX}w1:p1`) }));
    for (const outcome of [noReader, noSource, screen]) {
        assert.equal(outcome.kind, 'fresh');
        assert.deepEqual(outcome.freshness.newerPrompts, { kind: 'unknown' });
    }
    assert.deepEqual(asked, []);
});

test('an unreadable last run is reported once and comes back as ledger-unreadable, not ledger-empty', async () => {
    const told: string[] = [];
    const failed = unknown({ why: 'unreadable', detail: causeOf('locked') });
    const outcome = await freshnessOf({ unreported: () => { told.push('reported'); }, records: { lastRunOf: () => failed }, transcripts: registryWith({ claude: reader([user('hi')]) }) }, input());
    assert.deepEqual([outcome.kind, told], ['ledger-unreadable', ['reported']]);
});
