// The harness adapters, one row per kind, run through the same expectations. This pins what each adapter does TODAY so the
// "one adapter per harness" refactor can be proven behaviour-preserving. Every line marked `PINS TODAY:` is an oddity the refactor
// may change on purpose; when it does, it edits that line here.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ClaudeTranscripts } from '#src/adapters/claude-transcripts.ts';
import { CodexTranscripts } from '#src/adapters/codex-transcripts.ts';
import { OpencodeTranscripts } from '#src/adapters/opencode-transcripts.ts';
import { ScreenTranscripts } from '#src/adapters/screen-transcripts.ts';
import { CustomHarness } from '#src/adapters/custom-harness.ts';
import { wireAutocompact } from '#src/daemon/autocompact.ts';
import { enumeratorFor } from '#src/daemon/backends.ts';
import { MAKERS } from '#src/daemon/harness-makers.ts';
import type { Config } from '#src/daemon/config.ts';
import { Autocompact } from '#src/recap/application/autocompact.ts';
import type { LaneContexts } from '#src/recap/application/lane-contexts.ts';
import type { LaneRecent } from '#src/recap/application/lane-recent.ts';
import type { Informer } from '#src/recap/application/informer.ts';
import { CompactionClaims } from '#src/recap/application/compaction-claims.ts';
import { compactable, targetsOf } from '#src/recap/application/compaction-targets.ts';
import { RecapJob } from '#src/recap/application/recap-job.ts';
import { emptyBoard } from '#src/recap/domain/board.ts';
import { BACKEND_IDS, MODEL_DEFAULTS } from '#src/recap/domain/backend.ts';
import { COMPACTABLE } from '#src/recap/domain/compaction.ts';
import type { Observed } from '#src/recap/domain/compaction.ts';
import { tabId } from '#src/recap/domain/ids.ts';
import { policyOf } from '#src/recap/domain/autocompact.ts';
import { tuningOf } from '#src/recap/domain/autocompact-style.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import { instant } from '#src/recap/domain/time.ts';
import type { Decider } from '#src/ports/decider.ts';
import type { Harness } from '#src/ports/harness.ts';
import type { Summarizer, Written } from '#src/ports/summarizer.ts';
import type { ScreenResult, Screens } from '#src/ports/screens.ts';
import { UNREAD } from '#src/ports/transcripts.ts';
import type { Chunk, ChunkResult, Located, Mark, Transcripts } from '#src/ports/transcripts.ts';
import { NO_REPOS } from '#test/support.ts';
import { memoryStore } from '#test/db/support.ts';
import { opencodeFixture } from '#test/opencode-fixture.ts';
import { compactionFlow, typingFleet } from '#test/fakes/compaction-fleet.ts';

const BUDGET = 1 << 20;
const dir = mkdtempSync(join(tmpdir(), 'recap-conformance-'));
after(() => { rmSync(dir, { recursive: true, force: true }); });

const FIXTURES = join(import.meta.dirname, 'fixtures');
const fixtureLines = (name: string): string[] => readFileSync(join(FIXTURES, name), 'utf8').split('\n').filter((line) => line !== '');
const lane = (agent: string, extra: { cwd?: string; session?: string; pane?: string } = {}): Lane =>
    laneFrom({ paneId: extra.pane ?? 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent, status: 'idle', ...(extra.cwd === undefined ? {} : { cwd: extra.cwd }), ...(extra.session === undefined ? {} : { session: extra.session }) });
const today = (): string => { const day = new Date(); return join(String(day.getFullYear()), String(day.getMonth() + 1).padStart(2, '0'), String(day.getDate()).padStart(2, '0')); };

interface Row {
    readonly kind: string;
    readonly reader: Transcripts;
    /** placed on a source that holds nothing */
    readonly empty: Lane;
    /** placed on a recorded compaction */
    readonly recorded: Lane;
    /** nothing to find it by (no cwd, no session, or a kind it does not read) */
    readonly unplaced: Lane;
    /** the recorded source's `observed`; `absent` when the reader has no such method */
    readonly observed: Observed | null | 'absent';
    /** the recorded source's compaction marks; `absent` when the reader does not report marks at all */
    readonly marks: readonly Mark[] | 'absent';
    /** whether the reader has an in-flight method */
    readonly inFlight: boolean;
    /** the recorded source's newest user prompt; `null` when it holds none (or, for a screen, cannot say) */
    readonly prompt: string | null;
    /** whether the kind is offered a compaction today (`COMPACTABLE`), written here by hand so the table does not read the constant it checks */
    readonly compactable: boolean;
}

/** Writes each kind's files under `dir` and returns its row. Synchronous: the rows are built once, before the tests run. */
function rows(): Row[] {
    const out: Row[] = [];

    // claude: a session file per id in one project folder
    mkdirSync(join(dir, 'claude', 'proj'), { recursive: true });
    writeFileSync(join(dir, 'claude', 'proj', 'empty.jsonl'), '');
    copyFileSync(join(FIXTURES, 'claude-compact-boundary.jsonl'), join(dir, 'claude', 'proj', 'recorded.jsonl'));
    out.push({
        kind: 'claude', reader: new ClaudeTranscripts(join(dir, 'claude')),
        empty: lane('claude', { session: 'empty' }), recorded: lane('claude', { session: 'recorded' }), unplaced: lane('claude'),
        // PINS TODAY: the boundary row alone: after is the compaction's postTokens, peak is its preTokens, no window or model is stated
        observed: { tokens: 3057, peak: 39532, window: null, model: null },
        marks: [{ kind: 'compacted', at: Date.parse('2026-10-07T16:38:09.490Z'), tokensBefore: 39532, tokensAfter: 3057, tookMs: 15588, trigger: 'manual' }],
        inFlight: true,
        prompt: 'keep going',
        compactable: true,
    });

    // codex: one rollout per lane, located by the cwd on its first line (the recorded fixture has no session line of its own)
    const codexRoot = join(dir, 'codex');
    const day = join(codexRoot, today());
    mkdirSync(day, { recursive: true });
    writeFileSync(join(day, 'rollout-empty.jsonl'), `${JSON.stringify({ type: 'session_meta', payload: { cwd: '/empty' } })}\n`);
    writeFileSync(join(day, 'rollout-recorded.jsonl'), [JSON.stringify({ type: 'session_meta', payload: { cwd: '/repo' } }), ...fixtureLines('codex-compacted.jsonl')].join('\n') + '\n');
    out.push({
        kind: 'codex', reader: new CodexTranscripts(codexRoot),
        empty: lane('codex', { cwd: '/empty' }), recorded: lane('codex', { cwd: '/repo' }), unplaced: lane('codex'),
        // PINS TODAY: the newest token_count after the compaction is the use and the peak too, so the pre-compaction 17 133 is not kept as a peak (claude keeps it); the window is the one the rollout states
        observed: { tokens: 4617, peak: 4617, window: 258_400, model: null },
        marks: [{ kind: 'compacted', at: Date.parse('2026-10-06T13:09:05.181Z'), tokensBefore: 17133, tokensAfter: 4617 }],
        inFlight: false,
        // PINS TODAY: the recorded rollout carries no user message, so there is no prompt to find
        prompt: null,
        compactable: true,
    });

    // opencode: one database; /repo holds the recorded compaction, /elsewhere a session with no messages at all
    const database = opencodeFixture(dir);
    database.add({ id: 'm1', session: 'ses_new', role: 'user', updated: 100, parts: [{ type: 'text', text: 'keep going' }] });
    const created = 1_790_000_009_000;
    database.add({ id: 'm2', session: 'ses_new', role: 'assistant', updated: 120, data: { 'summary': true, mode: 'compaction', providerID: 'acme', modelID: 'big-1', time: { created, completed: created + 7000 }, tokens: { input: 900, output: 80, cache: { read: 100, write: 20 } } }, parts: [{ type: 'text', text: '## Goal\nRename.' }] });
    database.close();
    out.push({
        kind: 'opencode', reader: new OpencodeTranscripts(database.db),
        empty: lane('opencode', { cwd: '/elsewhere' }), recorded: lane('opencode', { cwd: '/repo' }), unplaced: lane('opencode'),
        // PINS TODAY: output tokens are not counted; the provider/model is the message's own
        observed: { tokens: 1020, peak: 1020, window: null, model: 'acme/big-1' },
        marks: [{ kind: 'compacted', at: created, tokensBefore: 1020, tookMs: 7000 }],
        inFlight: false,
        prompt: 'keep going',
        compactable: true,
    });

    // screen (`*`, here read as gemini): the pane's text; a pane that is empty holds nothing
    const screens: Screens = { readScreen: (pane): Promise<ScreenResult> => Promise.resolve({ kind: 'screen', text: pane === 'w1:p8' ? '' : 'I fixed the parser and the tests pass.', revision: 1, truncated: false }) };
    out.push({
        kind: 'gemini', reader: new ScreenTranscripts(screens, (agent) => agent === 'gemini'),
        empty: lane('gemini', { pane: 'w1:p8' }), recorded: lane('gemini', { pane: 'w1:p3' }), unplaced: lane('zed'),
        // PINS TODAY: a screen has no context to read, so the method is absent and LaneContexts says "cannot read"
        observed: 'absent',
        // PINS TODAY: a screen reports no compaction marks, so a compaction read from one can only end `unconfirmed`
        marks: 'absent',
        inFlight: false,
        // PINS TODAY: a screen cannot say what the operator typed (screen-transcripts.ts:35-37 returns null)
        prompt: null,
        compactable: false,
    });
    return out;
}

const ROWS = rows();

const chunkOf = async (result: Promise<ChunkResult>): Promise<Chunk> => {
    const got = await result;
    assert.equal(got.kind, 'chunk', JSON.stringify(got));
    return got;
};
const sourceOf = (found: Located): string => {
    assert.equal(found.kind, 'located', JSON.stringify(found));
    return found.source;
};

/** What the wiring of the daemon's autocompact says about a lane, with its kind enabled in the kinds: its skip, if it was skipped. The share is 62 %, so the gates before the in-flight one pass. */
async function skipOf(readers: readonly Transcripts[], placed: Lane, kind: string): Promise<{ readonly gate: string; readonly detail: string | null } | undefined> {
    const store = memoryStore();
    store.db.prepare("INSERT INTO tab (id, first_seen, last_seen) VALUES ('w1:t1', 1, 1)").run();
    const decider: Decider = { label: 'fake', ask: () => Promise.reject(new Error('the decider is not reached when the in-flight gate stops the lane')) };
    const env = (key: string): string | undefined => (key === 'TAB_RECAP_AUTOCOMPACT_KINDS' ? kind : undefined);
    const config = { autocompact: { ...policyOf(env), mode: 'on' }, tuning: tuningOf(() => undefined) } as unknown as Config;
    const service: Autocompact = wireAutocompact({
        config: () => config, awaiting: () => Promise.resolve({ kind: 'clear' }), store, transcripts: readers,
        contexts: { of: () => ({ tokens: 620_000, window: 1_000_000, source: 'observed' }) } as unknown as LaneContexts,
        recent: { of: () => Promise.resolve([]) } as unknown as LaneRecent,
        recaps: { refreshNow: () => Promise.resolve() } as unknown as RecapJob,
        informer: { current: emptyBoard() } as unknown as Informer,
        decider: () => decider, events: { lane: () => undefined, inWorkspace: () => undefined },
        claims: new CompactionClaims(), log: () => undefined,
    });
    await service.consider(placed);
    const [skip] = store.autocompact.skips();
    return skip === undefined ? undefined : { gate: skip.gate, detail: skip.detail ?? null };
}

for (const row of ROWS) {
    test(`${row.kind}: locate places a lane, or says why it cannot, and never throws`, async () => {
        for (const each of [row.empty, row.recorded]) {
            assert.equal((await row.reader.locate(each)).kind, 'located');
        }
        assert.equal((await row.reader.locate(row.unplaced)).kind, 'unknown');
    });

    test(`${row.kind}: a read from the start, then from its own position, finds nothing new the second time`, async () => {
        for (const each of [row.empty, row.recorded]) {
            const source = sourceOf(await row.reader.locate(each));
            const first = await chunkOf(row.reader.read(source, UNREAD, BUDGET));
            const second = await chunkOf(row.reader.read(source, first.position, BUDGET));
            assert.equal(second.grew, false);
        }
        const empty = await chunkOf(row.reader.read(sourceOf(await row.reader.locate(row.empty)), UNREAD, BUDGET));
        assert.equal(empty.entries.length, 0, 'an empty source yields no entries');
    });

    test(`${row.kind}: latestPrompt finds the newest user prompt of the recorded source, and reading it moves no position`, async () => {
        const source = sourceOf(await row.reader.locate(row.recorded));
        const before = await chunkOf(row.reader.read(source, UNREAD, BUDGET));
        assert.deepEqual(await row.reader.latestPrompt(source, BUDGET), { kind: 'prompt', text: row.prompt });
        const later = await chunkOf(row.reader.read(source, UNREAD, BUDGET));
        assert.deepEqual([later.position, later.entries.length], [before.position, before.entries.length]);
    });

    test(`${row.kind}: observed is null for an empty source; the recorded one gives today's numbers, or the method is absent`, async () => {
        if (row.observed === 'absent') {
            assert.equal(typeof row.reader.observed, 'undefined');
            return;
        }
        assert.equal(typeof row.reader.observed, 'function');
        const empty = await row.reader.observed?.(sourceOf(await row.reader.locate(row.empty)), BUDGET);
        assert.deepEqual(empty, { kind: 'observed', observed: null });
        const recorded = await row.reader.observed?.(sourceOf(await row.reader.locate(row.recorded)), BUDGET);
        assert.deepEqual(recorded, { kind: 'observed', observed: row.observed });
    });

    test(`${row.kind}: the compaction marks of the recorded source are the ones the existing tests expect; a screen reports none`, async () => {
        const chunk = await chunkOf(row.reader.read(sourceOf(await row.reader.locate(row.recorded)), UNREAD, BUDGET));
        if (row.marks === 'absent') {
            assert.equal(chunk.marks, undefined);
            return;
        }
        assert.deepEqual(chunk.marks, row.marks);
    });

    test(`${row.kind}: inFlight is present for claude only; with the kind enabled for autocompact, where it is absent autocompact says why it stopped`, async () => {
        if (!row.inFlight) {
            assert.equal(typeof row.reader.inFlight, 'undefined');
            // PINS TODAY: the message names the lane's own kind and claims there is no reader, although the reader exists; a screen lane is looked up by its kind, not by the `*` reader
            const skip = await skipOf([row.reader], row.recorded, row.kind);
            assert.deepEqual(skip, { gate: 'in-flight', detail: `no reader for ${row.kind}` });
            return;
        }
        assert.equal(typeof row.reader.inFlight, 'function');
        const found = await row.reader.inFlight?.(sourceOf(await row.reader.locate(row.recorded)), BUDGET);
        assert.deepEqual(found, { kind: 'in-flight', count: 0 });
    });

    test(`${row.kind}: ${row.compactable ? 'offered a compaction' : 'not offered a compaction'}`, () => {
        const offered = targetsOf([row.recorded], { kind: 'all' }, { pane: null, focused: null });
        assert.equal(offered.length, row.compactable ? 1 : 0);
        assert.equal(compactable([row.recorded]).length, row.compactable ? 1 : 0);
    });
}

test('COMPACTABLE is claude, codex and opencode: hermes and the screen kinds are not offered (PINS TODAY)', () => {
    assert.deepEqual(COMPACTABLE, ['claude', 'codex', 'opencode']);
    assert.deepEqual(compactable([lane('hermes'), lane('gemini'), lane('custom')]), []);
});

test('every BACKEND_IDS id has a maker that names itself; custom has no model and no enumerator', () => {
    const config = { backend: 'auto', models: { claude: 'haiku', codex: '', opencode: '', hermes: '', custom: '' }, effort: 'default', customCommand: 'my-llm --model x', timeoutMs: 1000 } as unknown as Config;
    assert.deepEqual(Object.keys(MAKERS).toSorted(), [...BACKEND_IDS].toSorted());
    for (const id of BACKEND_IDS) {
        assert.equal(MAKERS[id](config, dir).id, id);
    }
    assert.equal(MODEL_DEFAULTS.custom, '');
    assert.equal(enumeratorFor({ ...config, backend: 'custom' }, ['custom'], dir), null);
    for (const id of BACKEND_IDS.filter((each) => each !== 'custom')) {
        // every other id gets an enumerator, whichever harness it is
        assert.notEqual(enumeratorFor({ ...config, backend: id }, [id], dir), null, `${id} enumerates`);
    }
    // PINS TODAY: custom's label names only the command; the model setting is silently ignored
    const harness: Harness = new CustomHarness('my-llm --model x', dir, 1000);
    assert.equal(harness.label({ model: 'gpt-x', effort: 'high' }), 'custom/my-llm');
});

// Hermes: a headless job harness only. Nothing reads its history, so it is refused in each place that needs a reader.
// The autocompact half enables hermes in the kinds (the production default is claude alone, a record-only lane); the record-only variant is not pinned here.
test('hermes refuses: not compactable, `no reader for hermes` in the recap, and autocompact stops the lane in-flight (with the kind enabled)', async () => {
    const hermes = lane('hermes', { pane: 'w1:p5', cwd: '/repo', session: 'h1' });
    assert.deepEqual(targetsOf([hermes], { kind: 'all' }, { pane: null, focused: null }), []);
    const world = typingFleet({ 'w1:p5': 'idle' });
    await compactionFlow(world, 'all', null, [[]], [hermes]).run({ tab: 'w1:t1', pane: null, note: null });
    assert.deepEqual(world.typed, [], 'nothing is typed into hermes');
    assert.match(world.toasts.join('\n'), /No agent here can be compacted/);

    const store = memoryStore();
    const writer: Summarizer = { backend: 'fake', write: (): Promise<Written> => Promise.resolve({ kind: 'written', text: '{"ops":[]}', costUsd: 0 }) };
    const job = new RecapJob({
        repos: NO_REPOS, transcripts: [], records: store.records, ledger: store.ledger,
        clock: { now: (): ReturnType<typeof instant> => instant(3) }, summarizer: (): Summarizer => writer,
        language: (): string => 'en', log: (): void => undefined,
    });
    await job.refreshNow(tabId('w1:t1'), [hermes]);
    assert.match(store.records.readRecap('w1:t1')?.error ?? '', /w1:p5: no reader for hermes/);

    assert.deepEqual(await skipOf([], hermes, 'hermes'), { gate: 'in-flight', detail: 'no reader for hermes' });
});
