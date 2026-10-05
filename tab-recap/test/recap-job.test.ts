import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RecapJob } from '#src/recap/application/recap-job.ts';
import { tabId } from '#src/recap/domain/ids.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import { instant } from '#src/recap/domain/time.ts';
import type { HiddenState } from '#src/recap/domain/board.ts';
import { blankRecap, NOTHING_HIDDEN } from '#src/ports/recap-store.ts';
import type { RecapStore, TabRecap, TabView } from '#src/ports/recap-store.ts';
import type { RecapRequest, Summarizer, Written } from '#src/ports/summarizer.ts';
import type { ChunkResult, Located, Transcripts } from '#src/ports/transcripts.ts';

class MemoryStore implements RecapStore {
    recaps = new Map<string, TabRecap>();
    readRecap(tab: string): TabRecap | null { return this.recaps.get(tab) ?? null; }
    writeRecap(recap: TabRecap): void { this.recaps.set(recap.tab, recap); }
    readTab(): TabView | null { return null; }
    writeTab(): void { /* not needed */ }
    request(): void { /* not needed */ }
    takeRequests(): readonly never[] { return []; }
    readHidden(): HiddenState { return NOTHING_HIDDEN; }
    writeHidden(): void { /* not needed */ }
    requestVisibility(): void { /* not needed */ }
    takeVisibility(): readonly never[] { return []; }
}

const said: Record<string, string> = { 'w1:p1': 'migrate victoria', 'w1:p2': 'run the tests' };

function transcriptsOf(agent: string): Transcripts {
    return {
        agent,
        locate: (lane: Lane): Located => ({ kind: 'located', path: `/t/${lane.pane}`, size: 100 }),
        read: (path: string): ChunkResult => {
            const pane = path.slice(3);
            return { kind: 'chunk', entries: [{ role: 'user', text: said[pane] ?? '' }], title: null, lastPrompt: said[pane] ?? null, claudeRecap: null, end: 100, size: 100 };
        },
    };
}

test('one recap for the tab, written from every lane, advancing every cursor', async () => {
    const requests: RecapRequest[] = [];
    const summarizer: Summarizer = {
        backend: 'fake',
        write: (request: RecapRequest): Promise<Written> => { requests.push(request); return Promise.resolve({ kind: 'written', markdown: '## Goal\n- both', costUsd: 0.01 }); },
    };
    const store = new MemoryStore();
    const job = new RecapJob({
        transcripts: [transcriptsOf('claude'), transcriptsOf('codex')],
        store, clock: { now: (): ReturnType<typeof instant> => instant(5) }, summarizer: (): Summarizer => summarizer, words: (): number => 300, language: (): string => 'en', log: (): void => undefined,
    });
    const lanes = [
        laneFrom({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', session: 's1' }),
        laneFrom({ paneId: 'w1:p2', tabId: 'w1:t1', workspaceId: 'w1', agent: 'codex' }),
    ];
    job.request(tabId('w1:t1'), lanes, 'requested');
    await new Promise((resolve) => { setTimeout(resolve, 20); });
    const [only] = requests;
    assert.equal(requests.length, 1, 'one summarizer call for the whole tab');
    assert.ok(only !== undefined);
    assert.match(only.excerpt, /=== claude in w1:p1 ===[\s\S]*migrate victoria[\s\S]*=== codex in w1:p2 ===[\s\S]*run the tests/);
    const recap = store.readRecap('w1:t1');
    assert.ok(recap !== null);
    assert.equal(recap.markdown, '## Goal\n- both');
    assert.deepEqual(recap.lanes.map((c) => [c.pane, c.cursor]), [['w1:p1', 100], ['w1:p2', 100]]);
});

const quiet: Transcripts = {
    agent: 'claude',
    locate: (lane: Lane): Located => ({ kind: 'located', path: `/t/${lane.pane}`, size: 100 }),
    read: (): ChunkResult => ({ kind: 'chunk', entries: [], title: null, lastPrompt: null, claudeRecap: null, end: 100, size: 100 }),
};

async function rewriteWith(language: string, stored: string | undefined, cause: 'requested' | 'focused'): Promise<{ calls: RecapRequest[]; recap: TabRecap | null }> {
    const calls: RecapRequest[] = [];
    const summarizer: Summarizer = {
        backend: 'fake',
        write: (request: RecapRequest): Promise<Written> => { calls.push(request); return Promise.resolve({ kind: 'written', markdown: '## Objetivo\n- hecho', costUsd: 0 }); },
    };
    const store = new MemoryStore();
    const lane = laneFrom({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', session: 's1' });
    const base = blankRecap('w1:t1');
    store.writeRecap({
        ...base, markdown: '## Goal\n- migrate', at: 1,
        lanes: [{ pane: 'w1:p1', agent: 'claude', transcript: '/t/w1:p1', cursor: 100, title: null, lastPrompt: null, claudeRecap: null }],
        ...(stored === undefined ? {} : { language: stored }),
    });
    const job = new RecapJob({
        transcripts: [quiet], store, clock: { now: (): ReturnType<typeof instant> => instant(9) }, summarizer: (): Summarizer => summarizer,
        words: (): number => 300, language: (): string => language, log: (): void => undefined,
    });
    job.request(tabId('w1:t1'), [lane], cause);
    await new Promise((resolve) => { setTimeout(resolve, 20); });
    return { calls, recap: store.readRecap('w1:t1') };
}

test('a language switch with nothing new REWRITES the recap — on a request and on a focus', async () => {
    for (const cause of ['requested', 'focused'] as const) {
        const { calls, recap } = await rewriteWith('es', 'en', cause);
        assert.equal(calls.length, 1, `${cause}: the early return is bypassed`);
        const [first] = calls;
        assert.deepEqual([first?.language, first?.previousLanguage, first?.excerpt], ['es', 'en', '']);
        assert.equal(recap?.language, 'es');
        assert.equal(recap.markdown, '## Objetivo\n- hecho');
    }
});

test('the same language with nothing new does NOT call the summarizer (no cost for nothing)', async () => {
    for (const cause of ['requested', 'focused'] as const) {
        const { calls } = await rewriteWith('en', 'en', cause);
        assert.equal(calls.length, 0, cause);
    }
});

test('a recap stored before languages existed counts as English; a failed rewrite keeps the old language so it is retried', async () => {
    const legacy = await rewriteWith('es', undefined, 'requested');
    assert.equal(legacy.calls[0]?.previousLanguage, 'en');
    const failing: Summarizer = { backend: 'fake', write: (): Promise<Written> => Promise.resolve({ kind: 'unknown', why: { why: 'failed', code: 1, detail: 'x' } }) };
    const store = new MemoryStore();
    const lane = laneFrom({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', session: 's1' });
    store.writeRecap({ ...blankRecap('w1:t1'), markdown: '## Goal\n- m', at: 1, language: 'en' });
    const job = new RecapJob({ transcripts: [quiet], store, clock: { now: (): ReturnType<typeof instant> => instant(9) }, summarizer: (): Summarizer => failing, words: (): number => 300, language: (): string => 'es', log: (): void => undefined });
    job.request(tabId('w1:t1'), [lane], 'requested');
    await new Promise((resolve) => { setTimeout(resolve, 20); });
    assert.equal(store.readRecap('w1:t1')?.language, 'en');
});
