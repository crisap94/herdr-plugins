import { test } from 'node:test';
import { registryWith } from '#test/fakes/transcript-registry.ts';
import assert from 'node:assert/strict';
import { RecapJob } from '#src/recap/application/recap-job.ts';
import { tabId } from '#src/recap/domain/ids.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import { instant } from '#src/recap/domain/time.ts';
import type { RecapRequest, Summarizer, Written } from '#src/ports/summarizer.ts';
import type { ChunkResult, Located, PromptResult, Transcripts } from '#src/ports/transcripts.ts';
import { memoryStore } from '#test/db/support.ts';
import { NO_REPOS } from '#test/support.ts';

const transcripts: Transcripts = {
    agent: 'claude',
    locate: (lane: Lane): Promise<Located> => Promise.resolve({ kind: 'located', source: `/t/${lane.pane}` }),
    latestPrompt: (): Promise<PromptResult> => Promise.resolve({ kind: 'prompt', text: null }),
    read: (): Promise<ChunkResult> => Promise.resolve({ kind: 'chunk', entries: [{ role: 'user', text: 'migrate victoria' }], title: null, lastPrompt: null, claudeRecap: null, notes: [], position: { cursor: 100, tail: null }, grew: true }),
};

async function recapWith(keepInput: (() => boolean) | undefined): Promise<ReturnType<ReturnType<typeof memoryStore>['inputs']['runs']>> {
    const answer = JSON.stringify({ ops: [{ op: 'add', section: 'goal', text: 'Migrate the metrics store', anchor: 'migrate victoria' }, { op: 'add', section: 'done', text: 'claude completed the migration.', anchor: 'migrate victoria' }, { op: 'add', section: 'done', text: 'Metrics are copied to `victoria`.', anchor: 'migrate victoria' }] });
    const narrator = JSON.stringify({ ops: [{ op: 'add', section: 'done', text: 'claude completed the migration.', anchor: 'migrate victoria' }] });
    const summarizer: Summarizer = { backend: 'fake', write: (request: RecapRequest): Promise<Written> => Promise.resolve({ kind: 'written', text: request.retry === undefined ? answer : narrator, costUsd: 0 }) };
    const store = memoryStore();
    const job = new RecapJob({
        repos: NO_REPOS, transcripts: registryWith({ [transcripts.agent]: transcripts }), records: store.records, ledger: store.ledger, clock: { now: (): ReturnType<typeof instant> => instant(5) },
        summarizer: (): Summarizer => summarizer, language: (): string => 'en', log: (): void => undefined, ...(keepInput === undefined ? {} : { keepInput }),
    });
    job.request(tabId('w1:t1'), [laneFrom({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', session: 's1' })], 'requested');
    await new Promise((resolve) => { setTimeout(resolve, 20); });
    const runs = store.inputs.runs({ tab: null, since: null, limit: 5, withInput: false });
    const [run] = runs;
    if (run !== undefined && run.hasInput) {
        assert.match(store.inputs.document(run.id) ?? '', /^<recap_input version="2">[\s\S]*migrate victoria[\s\S]*<\/recap_input>$/, 'the document as the writer saw it, without a correction');
        assert.doesNotMatch(store.inputs.document(run.id) ?? '', /<correction>/);
    }
    return runs;
}

test('a run stores the writer\'s document and its gate counts (the narrator item was refused, retried and dropped)', async () => {
    const [run] = await recapWith(undefined);
    assert.ok(run !== undefined);
    assert.equal(run.hasInput, true);
    assert.deepEqual(run.gateStats, { refused: { G1: 2 }, flagged: {}, dropped: 1 });
});

test('with the retention at 0 the input is not stored, the counts still are', async () => {
    const [run] = await recapWith(() => false);
    assert.ok(run !== undefined);
    assert.equal(run.hasInput, false);
    assert.equal(run.gateStats?.dropped, 1);
});
