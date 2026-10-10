import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registryWith } from '#test/fakes/transcript-registry.ts';
import { RecapJob } from '#src/recap/application/recap-job.ts';
import { tabId } from '#src/recap/domain/ids.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import { instant } from '#src/recap/domain/time.ts';
import type { Debounce } from '#src/recap/domain/debounce.ts';
import { debounceOf } from '#src/recap/domain/debounce.ts';
import { memoryStore } from '#test/db/support.ts';
import { NO_REPOS } from '#test/support.ts';
import type { Summarizer, Written } from '#src/ports/summarizer.ts';
import type { ChunkResult, Located, PromptResult, Transcripts } from '#src/ports/transcripts.ts';

const WINDOW_60S: Debounce = debounceOf('60000');

interface Settings {
    debounce: Debounce;
}

interface Harness {
    readonly job: RecapJob;
    readonly settings: Settings;
    readonly reads: number[];
    callCount(): number;
}

function harness(settings: Settings, causes: string[], answer?: () => Promise<Written>): Harness {
    let calls = 0;
    const reads: number[] = [];
    const reader: Transcripts = {
        agent: 'claude',
        inFlight: { kind: 'unsupported', why: 'unregistered-reader' },
        locate: (lane: Lane): Promise<Located> => Promise.resolve({ kind: 'located', source: `/t/${lane.pane}` }),
        latestPrompt: (): Promise<PromptResult> => Promise.resolve({ kind: 'prompt', text: null }),
        read: (_source, from): Promise<ChunkResult> => {
            reads.push(from.cursor);
            return Promise.resolve({ kind: 'chunk', entries: [{ role: 'user', text: 'migrate victoria' }], title: null, lastPrompt: null, claudeRecap: null, notes: [], position: { cursor: reads.length, tail: null }, grew: true });
        },
    };
    const store = memoryStore();
    const summarizer: Summarizer = {
        backend: 'fake',
        contract: 'strict',
        write: (): Promise<Written> => {
            calls += 1;
            return answer?.() ?? Promise.resolve({ kind: 'written', text: JSON.stringify({ ops: [] }), costUsd: 0 });
        },
    };
    const job = new RecapJob({
        transcripts: registryWith({ claude: reader }), records: store.records, ledger: store.ledger, repos: NO_REPOS,
        clock: { now: (): ReturnType<typeof instant> => instant(Date.now()) }, summarizer: (): Summarizer => summarizer,
        language: (): string => 'en', log: (): void => undefined, debounce: (): Debounce => settings.debounce,
        ran: (event): void => { causes.push(event.cause ?? 'turn-ended'); },
    });
    return { job, settings, reads, callCount: (): number => calls };
}

const lane = laneFrom({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', session: 's1' });
const settle = (): Promise<void> => new Promise((resolve) => { setImmediate(resolve); });
const written: Written = { kind: 'written', text: JSON.stringify({ ops: [] }), costUsd: 0 };

test('an invalid window falls back to off', () => {
    assert.deepEqual(debounceOf(undefined), { kind: 'off' });
    assert.deepEqual(debounceOf('0'), { kind: 'off' });
    assert.deepEqual(debounceOf('5000'), { kind: 'window', window: 5000 });
    assert.deepEqual(debounceOf('300000'), { kind: 'window', window: 300000 });
    for (const value of ['4999', '300001', '-1', '1.5', 'off']) {
        assert.deepEqual(debounceOf(value), { kind: 'off' }, value);
    }
});

test('turn endings inside a run window join one run at the deadline, with the settle floor', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
    const causes: string[] = [];
    const created = harness({ debounce: WINDOW_60S }, causes);
    const job = created.job;
    job.request(tabId('w1:t1'), [lane], 'turn-ended');
    t.mock.timers.tick(0);
    await settle();
    assert.equal(causes.length, 1, 'the first run in the process is immediate');
    for (const at of [20_000, 30_000, 45_000]) {
        t.mock.timers.setTime(at);
        job.request(tabId('w1:t1'), [lane], 'turn-ended');
    }
    t.mock.timers.tick(14_999);
    await settle();
    assert.equal(causes.length, 1);
    t.mock.timers.tick(1);
    await settle();
    assert.equal(causes.length, 2);
    assert.equal(created.callCount(), 2);
    assert.deepEqual(created.reads, [0, 1], 'the deadline run reads from the cursor the first run left');
    t.mock.timers.setTime(119_000);
    job.request(tabId('w1:t1'), [lane], 'turn-ended');
    t.mock.timers.tick(2_499);
    await settle();
    assert.equal(causes.length, 2);
    t.mock.timers.tick(1);
    await settle();
    assert.equal(causes.length, 3, 'the ending at 119 seconds waits until 121.5 seconds');
});

test('a turn ending while a run is in progress waits the settle delay after its own ending', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
    const causes: string[] = [];
    let release: ((result: Written) => void) | undefined;
    let answers = 0;
    const blocked = new Promise<Written>((resolve) => { release = resolve; });
    const created = harness({ debounce: WINDOW_60S }, causes, () => {
        answers += 1;
        return answers === 1 ? blocked : Promise.resolve(written);
    });
    created.job.request(tabId('w1:t1'), [lane], 'requested');
    t.mock.timers.tick(0);
    await settle();
    t.mock.timers.setTime(100_000);
    created.job.request(tabId('w1:t1'), [lane], 'turn-ended');
    release?.(written);
    await settle();
    t.mock.timers.tick(2_499);
    await settle();
    assert.deepEqual(causes, ['requested']);
    t.mock.timers.tick(1);
    await settle();
    assert.deepEqual(causes, ['requested', 'turn-ended'], 'the ending at 100 seconds starts at 102.5 seconds');
});

test('forced causes start inside a window and stay forced in the again slot', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
    const causes: string[] = [];
    let release: ((result: Written) => void) | undefined;
    let answers = 0;
    const blocked = new Promise<Written>((resolve) => { release = resolve; });
    const created = harness({ debounce: WINDOW_60S }, causes, () => {
        answers += 1;
        return answers === 1 ? blocked : Promise.resolve(written);
    });
    const job = created.job;
    job.request(tabId('w1:t1'), [lane], 'requested');
    t.mock.timers.tick(0);
    await settle();
    assert.equal(created.callCount(), 1);
    job.request(tabId('w1:t1'), [lane], 'requested');
    job.request(tabId('w1:t1'), [lane], 'turn-ended');
    release?.(written);
    await settle();
    t.mock.timers.tick(0);
    await settle();
    assert.deepEqual(causes, ['requested', 'requested']);
    assert.equal(created.callCount(), 2);
});

test('a requested refresh replaces a pending turn-ended window and starts at once', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
    const causes: string[] = [];
    const created = harness({ debounce: WINDOW_60S }, causes);
    const job = created.job;
    job.request(tabId('w1:t1'), [lane], 'requested');
    t.mock.timers.tick(0);
    await settle();
    t.mock.timers.setTime(20_000);
    job.request(tabId('w1:t1'), [lane], 'turn-ended');
    t.mock.timers.setTime(20_001);
    job.request(tabId('w1:t1'), [lane], 'requested');
    t.mock.timers.tick(0);
    await settle();
    assert.deepEqual(causes, ['requested', 'requested']);
    t.mock.timers.setTime(60_000);
    t.mock.timers.tick(0);
    await settle();
    assert.equal(created.callCount(), 2, 'the cancelled turn-ended timer does not launch another run');
    job.request(tabId('w1:t1'), [lane], 'turn-ended');
    t.mock.timers.tick(19_999);
    await settle();
    assert.equal(created.callCount(), 2, 'a later ending waits for the window measured from the refresh start');
    t.mock.timers.tick(1);
    await settle();
    assert.equal(created.callCount(), 2, 'the window ends at 80 001 ms, the refresh start plus 60 000 ms');
    t.mock.timers.tick(1);
    await settle();
    assert.equal(created.callCount(), 3);
});

test('a refresh behind a run in progress runs next and resolves its caller after that run', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
    const causes: string[] = [];
    let release: ((result: Written) => void) | undefined;
    let answers = 0;
    const blocked = new Promise<Written>((resolve) => { release = resolve; });
    const created = harness({ debounce: WINDOW_60S }, causes, () => {
        answers += 1;
        return answers === 1 ? blocked : Promise.resolve(written);
    });
    created.job.request(tabId('w1:t1'), [lane], 'turn-ended');
    t.mock.timers.tick(2_500);
    await settle();
    t.mock.timers.setTime(10_000);
    let refreshed = false;
    void created.job.refreshNow(tabId('w1:t1'), [lane]).then(() => (refreshed = true));
    t.mock.timers.tick(0);
    await settle();
    assert.equal(created.callCount(), 1, 'the refresh waits for the run in progress');
    release?.(written);
    await settle();
    t.mock.timers.tick(0);
    await settle();
    assert.deepEqual(causes, ['turn-ended', 'requested']);
    assert.equal(refreshed, true);
});

test('a changed lane set starts at once inside a run window', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
    const causes: string[] = [];
    const created = harness({ debounce: WINDOW_60S }, causes);
    const job = created.job;
    job.request(tabId('w1:t1'), [lane], 'turn-ended');
    t.mock.timers.tick(0);
    await settle();
    t.mock.timers.setTime(20_000);
    const changed = laneFrom({ paneId: 'w1:p2', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', session: 's1' });
    job.request(tabId('w1:t1'), [changed], 'turn-ended');
    t.mock.timers.tick(0);
    await settle();
    assert.equal(causes.length, 2);
});

test('with no window, each turn ending starts its own run after the settle delay', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
    const causes: string[] = [];
    const created = harness({ debounce: debounceOf(undefined) }, causes);
    created.job.request(tabId('w1:t1'), [lane], 'turn-ended');
    t.mock.timers.tick(2_499);
    await settle();
    assert.equal(causes.length, 0);
    t.mock.timers.tick(1);
    await settle();
    assert.equal(causes.length, 1);
    t.mock.timers.setTime(20_000);
    created.job.request(tabId('w1:t1'), [lane], 'turn-ended');
    t.mock.timers.tick(2_499);
    await settle();
    assert.equal(causes.length, 1);
    t.mock.timers.tick(1);
    await settle();
    assert.equal(causes.length, 2);
});

test('the window is read on every request, so a change applies without a restart', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
    const causes: string[] = [];
    const created = harness({ debounce: debounceOf(undefined) }, causes);
    created.job.request(tabId('w1:t1'), [lane], 'turn-ended');
    t.mock.timers.tick(2_500);
    await settle();
    assert.equal(causes.length, 1);
    created.settings.debounce = WINDOW_60S;
    t.mock.timers.setTime(3_000);
    created.job.request(tabId('w1:t1'), [lane], 'turn-ended');
    t.mock.timers.tick(59_499);
    await settle();
    assert.equal(causes.length, 1, 'the window is measured from the start of the run that ran with the window off');
    t.mock.timers.tick(1);
    await settle();
    assert.equal(causes.length, 2);
});
