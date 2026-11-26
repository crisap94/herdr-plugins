import { textOf } from '@stateforge-labs/session-ledger';
import { checkedLedger, checkedRecords } from '#src/ports/guarded-reads.ts';
import { test } from 'node:test';
import { registryWith } from '#test/fakes/transcript-registry.ts';
import assert from 'node:assert/strict';
import { RecapJob } from '@stateforge-labs/session-ledger';
import { tabId, agentKind } from '#test/support/ids.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import type { FollowedSession } from '#src/recap/domain/lane.ts';
import { instant } from '@stateforge-labs/session-ledger';
import type { RecapRequest, Written } from '@stateforge-labs/session-ledger';
import type { LegacyWriter as Writer } from '@stateforge-labs/session-ledger';
import type { ChunkResult, Located, PromptResult } from '@stateforge-labs/session-ledger';
import type { LegacySessionReader as SessionReader } from '@stateforge-labs/session-ledger';
import { memoryStore, runsOf } from '#test/db/support.ts';
import { NO_REPOS } from '#test/support.ts';
import { mintFactId } from '#src/adapters/db/ledger-rows.ts';
import { brand } from '@stateforge-labs/session-ledger';
import type { LegacyKeepInput as KeepInput } from '@stateforge-labs/session-ledger';
import type { Text } from '@stateforge-labs/session-ledger';
import { cursorOf, grewOf, sourcePathOf } from '@stateforge-labs/session-ledger';
import { seenLane } from '#test/support/seen.ts';

const transcripts: SessionReader = {
    agent: agentKind('claude'),
    inFlight: { kind: 'unsupported', why: 'unregistered-reader' },
    locate: (lane: FollowedSession): Promise<Located> => Promise.resolve({ kind: 'located', source: sourcePathOf(`/t/${lane.pane}`) }),
    latestPrompt: (): Promise<PromptResult> => Promise.resolve({ kind: 'prompt', text: null }),
    read: (): Promise<ChunkResult> => Promise.resolve({ kind: 'chunk', entries: [{ role: 'user', text: textOf('migrate victoria') }], title: null, lastPrompt: null, harnessRecap: null, notes: [], position: { cursor: cursorOf(100), tail: null }, grew: grewOf(true) }),
};

async function recapWith(keepInput: (() => KeepInput) | undefined): Promise<ReturnType<ReturnType<typeof memoryStore>['inputs']['runs']>> {
    const answer = JSON.stringify({ ops: [{ op: 'add', section: 'goal', text: 'Migrate the metrics store', anchor: 'migrate victoria' }, { op: 'add', section: 'done', text: 'claude completed the migration.', anchor: 'migrate victoria' }, { op: 'add', section: 'done', text: 'Metrics are copied to `victoria`.', anchor: 'migrate victoria' }] });
    const narrator = JSON.stringify({ ops: [{ op: 'add', section: 'done', text: 'claude completed the migration.', anchor: 'migrate victoria' }] });
    const summarizer: Writer = { backend: textOf('fake'), contract: 'strict', write: (request: RecapRequest): Promise<Written> => Promise.resolve({ kind: 'written', text: textOf(request.retry === undefined ? answer : narrator), costUsd: brand<number, 'Usd'>(0) }) };
    const store = memoryStore();
    const job = new RecapJob({ writerView: (): { readonly kind: 'full' } => ({ kind: 'full' }), mint: mintFactId,
        repos: NO_REPOS, transcripts: registryWith({ [transcripts.agent]: transcripts }), records: checkedRecords(store.records), ledger: checkedLedger(store.ledger), clock: { now: (): ReturnType<typeof instant> => instant(5) },
        summarizer: (): Writer => summarizer, language: (): Text => brand<string, 'Text'>('en'), log: (): void => undefined, ...(keepInput === undefined ? {} : { keepInput }),
    });
    job.request(tabId('w1:t1'), [laneFrom(seenLane({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', session: 's1' }))], 'requested');
    await new Promise((resolve) => { setTimeout(resolve, 20); });
    const runs = runsOf(store.inputs, { tab: null, since: null, limit: 5, withInput: false });
    const [run] = runs;
    if (run !== undefined && run.input === 'present') {
        assert.match(store.inputs.document(run.id) ?? '', /^<recap_input version="2">[\s\S]*migrate victoria[\s\S]*<\/recap_input>$/, 'the document as the writer saw it, without a correction');
        assert.doesNotMatch(store.inputs.document(run.id) ?? '', /<correction>/);
    }
    return runs;
}

test('a run stores the writer\'s document and its gate counts (the narrator item was refused, retried and dropped)', async () => {
    const [run] = await recapWith(undefined);
    assert.ok(run !== undefined);
    assert.equal(run.input, 'present');
    assert.deepEqual(run.gateStats, { refused: { G1: 2 }, flagged: {}, dropped: 1 });
});

test('with the retention at 0 the input is not stored, the counts still are', async () => {
    const [run] = await recapWith(() => brand<boolean, 'KeepInput'>(false));
    assert.ok(run !== undefined);
    assert.equal(run.input, 'absent');
    assert.equal(run.gateStats?.dropped, 1);
});
