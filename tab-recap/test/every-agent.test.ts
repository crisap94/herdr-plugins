import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Store } from '#src/adapters/db/database.ts';
import { memoryStore, seed } from '#test/db/support.ts';
import { NO_REPOS } from '#test/support.ts';
import { en } from '#src/i18n/en.ts';
import { es } from '#src/i18n/es.ts';
import { RecapJob } from '#src/recap/application/recap-job.ts';
import { present } from '#src/recap/render/present.ts';
import { tabId } from '#src/recap/domain/ids.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import { instant } from '#src/recap/domain/time.ts';
import { blankRecap } from '#src/ports/recap-records.ts';
import type { TabRecap } from '#src/ports/recap-records.ts';
import type { TabView } from '#src/ports/tab-views.ts';
import type { RecapRequest, Summarizer, Written } from '#src/ports/summarizer.ts';
import type { ChunkResult, Located, Position, PromptResult, Transcripts } from '#src/ports/transcripts.ts';

/** A reader whose positions are not bytes: it hands back what it was given plus one, and says what it saw. */
function recording(agent: string, source: (pane: string) => string, tail: string | null = null): { reader: Transcripts; seen: Position[] } {
    const seen: Position[] = [];
    const reader: Transcripts = {
        agent,
        locate: (lane): Promise<Located> => Promise.resolve({ kind: 'located', source: source(String(lane.pane)) }),
        latestPrompt: (): Promise<PromptResult> => Promise.resolve({ kind: 'prompt', text: null }),
        read: (_source: string, was: Position): Promise<ChunkResult> => {
            seen.push(was);
            return Promise.resolve({ kind: 'chunk', entries: [{ role: 'agent', text: 'hello from the screen' }], title: null, lastPrompt: null, claudeRecap: null, notes: [], position: { cursor: was.cursor + 1, tail }, grew: true });
        },
    };
    return { reader, seen };
}

const writer = (requests: RecapRequest[]): Summarizer => ({
    backend: 'fake',
    write: (request): Promise<Written> => { requests.push(request); return Promise.resolve({ kind: 'written', text: JSON.stringify({ goal: 'g' }), costUsd: 0 }); },
});

async function recapOf(transcripts: readonly Transcripts[], agents: readonly string[], store = memoryStore()): Promise<{ store: Store; requests: RecapRequest[] }> {
    const requests: RecapRequest[] = [];
    const job = new RecapJob({ repos: NO_REPOS, transcripts, records: store.records, clock: { now: (): ReturnType<typeof instant> => instant(3) }, summarizer: (): Summarizer => writer(requests), language: (): string => 'en', log: (): void => undefined });
    const lanes = agents.map((agent, at) => laneFrom({ paneId: `w1:p${at + 1}`, tabId: 'w1:t1', workspaceId: 'w1', agent }));
    job.request(tabId('w1:t1'), lanes, 'requested');
    await new Promise((resolve) => { setTimeout(resolve, 30); });
    return { store, requests };
}

test('a lane with no reader of its own is read by the `*` reader — the job does not know what a cursor means, it hands it back', async () => {
    const store = memoryStore();
    seed(store, { ...blankRecap('w1:t1'), lanes: [{ pane: 'w1:p1', agent: 'gemini', transcript: 'screen:w1:p1', cursor: 41, tail: 'abc', title: null, lastPrompt: null, claudeRecap: null }] });
    const screen = recording('*', (pane) => `screen:${pane}`, 'def');
    const { requests } = await recapOf([recording('claude', (pane) => `/t/${pane}`).reader, screen.reader], ['gemini'], store);
    assert.deepEqual(screen.seen, [{ cursor: 41, tail: 'abc' }], 'the stored cursor and tail went back to the reader as they were');
    assert.deepEqual(store.records.readRecap('w1:t1')?.lanes.map((lane) => [lane.cursor, lane.tail]), [[42, 'def']], 'and what the reader returned is what is stored');
    assert.deepEqual(requests[0]?.input.transcripts[0]?.entries.map((entry) => entry.text), ['hello from the screen']);
    assert.deepEqual(requests[0].input.agents.map((agent) => [agent.kind, agent.source]), [['gemini', 'screen']], 'the writer is told the lane is a screen');
});

test('an agent with a reader of its own never goes to the `*` reader; a source is unique, so a stored cursor of another source is not reused', async () => {
    const own = recording('claude', (pane) => `/t/${pane}`);
    const screen = recording('*', (pane) => `screen:${pane}`);
    const store = memoryStore();
    seed(store, { ...blankRecap('w1:t1'), lanes: [{ pane: 'w1:p1', agent: 'claude', transcript: '/t/old-session', cursor: 999, tail: null, title: null, lastPrompt: null, claudeRecap: null }] });
    await recapOf([screen.reader, own.reader], ['claude'], store);
    assert.equal(screen.seen.length, 0);
    assert.deepEqual(own.seen, [{ cursor: 0, tail: null }], 'a new session starts from the beginning');
});

test('a lane nobody can read is reported by name, and does not stop the others', async () => {
    const own = recording('claude', (pane) => `/t/${pane}`);
    const { store } = await recapOf([own.reader], ['hermes', 'claude']);
    assert.match(store.records.readRecap('w1:t1')?.error ?? '', /w1:p1: no reader for hermes/);
    assert.deepEqual(store.records.readRecap('w1:t1')?.lanes.map((lane) => lane.cursor), [0, 1]);
});

const cursor = (pane: string, transcript: string): TabRecap['lanes'][number] => ({ pane, agent: 'x', transcript, cursor: 1, tail: null, title: null, lastPrompt: null, claudeRecap: null });

test('the column says `(screen)` beside a lane read from its screen — in both languages — and nothing beside the others', () => {
    const recap = { ...blankRecap('w1:t1'), lanes: [cursor('w1:p1', 'screen:w1:p1'), cursor('w1:p2', '/t/b')], markdown: '## Goal\n- g', at: 0 };
    const tab: TabView = { tab: 'w1:t1', column: null, at: 0, lanes: [
        { pane: 'w1:p1', agent: 'gemini', status: 'idle', title: null, cwd: null }, { pane: 'w1:p2', agent: 'claude', status: 'idle', title: null, cwd: null },
    ] };
    for (const [messages, word] of [[en, '(screen)'], [es, '(pantalla)']] as const) {
        const text = present({ tab, recap, notes: new Map(), warnings: [], now: 0, messages }, 60, () => null).join('\n');
        assert.match(text, new RegExp(`gemini w1:p1 \\${word.replace(')', '\\)')}`));
        assert.equal(text.split(word).length, 2, 'only the screen lane');
    }
});
