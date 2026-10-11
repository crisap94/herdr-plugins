import { test, after } from 'node:test';
import { registryWith } from '#test/fakes/transcript-registry.ts';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ClaudeTranscripts } from '#src/adapters/claude-transcripts.ts';
import { splitReason } from '#src/ports/capability-reasons.ts';
import { CodexTranscripts } from '#src/adapters/codex-transcripts.ts';
import { OpencodeTranscripts } from '#src/adapters/opencode-transcripts.ts';
import { compactionPlans } from '#src/adapters/compaction-plan-registry.ts';
import { daemonTranscriptRegistry, IN_FLIGHT_CAPABILITIES, modalTranscriptRegistry } from '#src/adapters/transcript-registry.ts';
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
import { LaneClaims } from '#src/recap/application/lane-claims.ts';
import { compactable, targetsOf } from '#src/recap/application/compaction-targets.ts';
import { RecapJob } from '#src/recap/application/recap-job.ts';
import { emptyBoard } from '#src/recap/domain/board.ts';
import { BACKEND_IDS, MODEL_DEFAULTS } from '#src/recap/domain/backend.ts';
import type { BackendId } from '#src/recap/domain/backend.ts';
import { COMPACTABLE } from '#src/recap/domain/compaction.ts';
import { REGISTERED_KINDS } from '#src/recap/domain/registered-kinds.ts';
import type { RegisteredKind } from '#src/recap/domain/registered-kinds.ts';
import { handoffPlans, SETTLE_SOURCE } from '#src/adapters/handoff-plan-registry.ts';
import type { LocatedBy } from '#src/recap/domain/handoff-plan.ts';
import { HANDOFF_OBSERVATIONS, HANDOFF_OBSERVE_MS } from '#src/recap/application/handoff-limits.ts';
import type { Observed } from '#src/recap/domain/compaction.ts';
import { tabId } from '#src/recap/domain/ids.ts';
import { policyOf } from '#src/recap/domain/autocompact.ts';
import { tuningOf } from '#src/recap/domain/autocompact-style.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import type { TranscriptRegistry } from '#src/ports/transcript-registry.ts';
import type { InFlightReason } from '#src/ports/autocompact-reasons.ts';
import { duration, instant } from '#src/recap/domain/time.ts';
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
import { echoing, leaseSpy, senderOf, worldOf } from '#test/fakes/handoff-delivery.ts';
import type { LeaseSpy, World } from '#test/fakes/handoff-delivery.ts';
import { harness as handoffHarness, NOW, recapOf, request, SOURCE_LISTED, T1, TAB, TARGET, TEXT, task } from '#test/fakes/handoff-flow-harness.ts';
import type { FlowWorld } from '#test/fakes/handoff-flow-harness.ts';
import { fact } from '#test/fakes/fact-at.ts';

const BUDGET = 1 << 20;
const dir = mkdtempSync(join(tmpdir(), 'recap-conformance-'));
after(() => { rmSync(dir, { recursive: true, force: true }); });

const FIXTURES = join(import.meta.dirname, 'fixtures');
const fixtureLines = (name: string): string[] => readFileSync(join(FIXTURES, name), 'utf8').split('\n').filter((line) => line !== '');
const lane = (agent: string, extra: { cwd?: string; session?: string; pane?: string } = {}): Lane =>
    laneFrom({ paneId: extra.pane ?? 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent, status: 'idle', ...(extra.cwd === undefined ? {} : { cwd: extra.cwd }), ...(extra.session === undefined ? {} : { session: extra.session }) });
const today = (): string => { const day = new Date(); return join(String(day.getFullYear()), String(day.getMonth() + 1).padStart(2, '0'), String(day.getDate()).padStart(2, '0')); };

interface Row {
    readonly kind: BackendId | 'gemini';
    readonly reader: Transcripts;
    readonly empty: Lane;
    readonly recorded: Lane;
    readonly unplaced: Lane;
    readonly observed: Observed | null | 'absent';
    readonly marks: readonly Mark[] | 'absent';
    readonly inFlight: boolean;
    readonly prompt: string | null;
    readonly compactable: boolean;
}

function rows(): Row[] {
    const out: Row[] = [];

    mkdirSync(join(dir, 'claude', 'proj'), { recursive: true });
    writeFileSync(join(dir, 'claude', 'proj', 'empty.jsonl'), '');
    copyFileSync(join(FIXTURES, 'claude-compact-boundary.jsonl'), join(dir, 'claude', 'proj', 'recorded.jsonl'));
    out.push({
        kind: 'claude', reader: new ClaudeTranscripts(join(dir, 'claude')),
        empty: lane('claude', { session: 'empty' }), recorded: lane('claude', { session: 'recorded' }), unplaced: lane('claude'),
        observed: { tokens: 3057, peak: 39532, window: null, model: null },
        marks: [{ kind: 'compacted', at: Date.parse('2026-10-07T16:38:09.490Z'), tokensBefore: 39532, tokensAfter: 3057, tookMs: 15588, trigger: 'manual' }],
        inFlight: true,
        prompt: 'keep going',
        compactable: true,
    });

    const codexRoot = join(dir, 'codex');
    const day = join(codexRoot, today());
    mkdirSync(day, { recursive: true });
    writeFileSync(join(day, 'rollout-empty.jsonl'), `${JSON.stringify({ type: 'session_meta', payload: { cwd: '/empty' } })}\n`);
    const prompt = { type: 'response_item', timestamp: '2026-10-06T13:08:00.000Z', payload: { type: 'message', role: 'user', content: [{ text: 'keep going' }] } };
    writeFileSync(join(day, 'rollout-recorded.jsonl'), [JSON.stringify({ type: 'session_meta', payload: { cwd: '/repo' } }), JSON.stringify(prompt), ...fixtureLines('codex-compacted.jsonl')].join('\n') + '\n');
    out.push({
        kind: 'codex', reader: new CodexTranscripts(codexRoot),
        empty: lane('codex', { cwd: '/empty' }), recorded: lane('codex', { cwd: '/repo' }), unplaced: lane('codex'),
        observed: { tokens: 4617, peak: 4617, window: 258_400, model: null },
        marks: [{ kind: 'compacted', at: Date.parse('2026-10-06T13:09:05.181Z'), tokensBefore: 17133, tokensAfter: 4617 }],
        inFlight: true,
        prompt: 'keep going',
        compactable: true,
    });

    const database = opencodeFixture(dir);
    database.add({ id: 'm1', session: 'ses_new', role: 'user', updated: 100, parts: [{ type: 'text', text: 'keep going' }] });
    const created = 1_790_000_009_000;
    database.add({ id: 'm2', session: 'ses_new', role: 'assistant', updated: 120, data: { 'summary': true, mode: 'compaction', providerID: 'acme', modelID: 'big-1', time: { created, completed: created + 7000 }, tokens: { input: 900, output: 80, cache: { read: 100, write: 20 } } }, parts: [{ type: 'text', text: '## Goal\nRename.' }] });
    database.close();
    out.push({
        kind: 'opencode', reader: new OpencodeTranscripts(database.db),
        empty: lane('opencode', { cwd: '/elsewhere' }), recorded: lane('opencode', { cwd: '/repo' }), unplaced: lane('opencode'),
        observed: { tokens: 1020, peak: 1020, window: null, model: 'acme/big-1' },
        marks: [{ kind: 'compacted', at: created, tokensBefore: 1020, tookMs: 7000 }],
        inFlight: true,
        prompt: 'keep going',
        compactable: true,
    });

    const screens: Screens = { readScreen: (pane): Promise<ScreenResult> => Promise.resolve({ kind: 'screen', text: pane === 'w1:p8' ? '' : 'I fixed the parser and the tests pass.', revision: 1, truncated: false }) };
    out.push({
        kind: 'gemini', reader: new ScreenTranscripts(screens, (agent) => agent === 'gemini'),
        empty: lane('gemini', { pane: 'w1:p8' }), recorded: lane('gemini', { pane: 'w1:p3' }), unplaced: lane('zed'),
        observed: 'absent',
        marks: 'absent',
        inFlight: false,
        prompt: null,
        compactable: false,
    });
    return out;
}

const ROWS = rows();

function observedPinFor(kind: BackendId | 'gemini'): string {
    switch (kind) {
        case 'claude': return '; pins today: peak uses boundary preTokens, with no window or model stated';
        case 'codex': return '; pins today: peak is the post-compaction token_count and preTokens appears only in the mark';
        case 'opencode': return '; pins today: output tokens are excluded and provider/model come from the message';
        case 'gemini': return '; pins today: a screen has no observed method and LaneContexts cannot read it';
        case 'hermes':
        case 'custom': return '';
    }
    return '';
}

const chunkOf = async (result: Promise<ChunkResult>): Promise<Chunk> => {
    const got = await result;
    assert.equal(got.kind, 'chunk', JSON.stringify(got));
    return got;
};
const sourceOf = (found: Located): string => {
    assert.equal(found.kind, 'located', JSON.stringify(found));
    return found.source;
};

async function skipOf(readers: TranscriptRegistry, placed: Lane, kind: BackendId | 'gemini'): Promise<{ readonly gate: string; readonly detail: string | null } | undefined> {
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
        claims: new LaneClaims(), log: () => undefined,
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

    test(`${row.kind}: latestPrompt finds the newest user prompt of the recorded source, and reading it moves no position${row.kind === 'gemini' ? '; pins today: a screen cannot say what the operator typed' : ''}`, async () => {
        const source = sourceOf(await row.reader.locate(row.recorded));
        const before = await chunkOf(row.reader.read(source, UNREAD, BUDGET));
        assert.deepEqual(await row.reader.latestPrompt(source, BUDGET), { kind: 'prompt', text: row.prompt });
        const later = await chunkOf(row.reader.read(source, UNREAD, BUDGET));
        assert.deepEqual([later.position, later.entries.length], [before.position, before.entries.length]);
    });

    test(`${row.kind}: observed is null for an empty source; the recorded one gives today's numbers, or the method is absent${observedPinFor(row.kind)}`, async () => {
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

    test(`${row.kind}: the compaction marks of the recorded source are the ones the existing tests expect; a screen reports none${row.kind === 'gemini' ? '; pins today: screen has no marks, so a compaction would be unconfirmed but is not reachable today' : ''}`, async () => {
        const chunk = await chunkOf(row.reader.read(sourceOf(await row.reader.locate(row.recorded)), UNREAD, BUDGET));
        if (row.marks === 'absent') {
            assert.equal(chunk.marks, undefined);
            return;
        }
        assert.deepEqual(chunk.marks, row.marks);
    });

    test(`${row.kind}: inFlight capability is explicit and autocompact reports its reason`, async () => {
        if (!row.inFlight) {
            const capability = row.reader.inFlight;
            if (capability.kind !== 'unsupported') throw new Error('the screen reader must declare unsupported in-flight work');
            const skip = await skipOf(row.kind === 'gemini' ? registryWith({}, row.reader) : registryWith({ [row.reader.agent]: row.reader }), row.recorded, row.kind);
            assert.deepEqual(skip, { gate: 'in-flight', detail: 'screen transcripts do not contain in-flight work' });
            return;
        }
        const capability = row.reader.inFlight;
        if (capability.kind !== 'supported') throw new Error(`${row.kind} must support in-flight work`);
        const { split } = capability;
        if (split.kind === 'foreground-only') assert.ok(splitReason(split.why, row.kind).includes(row.kind), `${row.kind} names its foreground-only split`);
        const found = await capability.read(sourceOf(await row.reader.locate(row.recorded)), BUDGET);
        assert.deepEqual(found, { kind: 'in-flight', count: 0, background: [] });
    });

    test(`${row.kind}: ${row.compactable ? 'offered a compaction' : 'not offered a compaction'}`, () => {
        const offered = targetsOf([row.recorded], { kind: 'all' }, { pane: null, focused: null });
        assert.equal(offered.length, row.compactable ? 1 : 0);
        assert.equal(compactable([row.recorded]).length, row.compactable ? 1 : 0);
    });
}

test('pins today: COMPACTABLE is claude, codex and opencode; hermes and screen kinds are not offered', () => {
    assert.deepEqual(COMPACTABLE, ['claude', 'codex', 'opencode']);
    assert.deepEqual(compactable([lane('hermes'), lane('gemini'), lane('custom')]), []);
});

test('registered kind flags match transcript and compaction lookup outcomes', () => {
    const transcripts = modalTranscriptRegistry();
    const inFlight: Readonly<Record<string, { readonly kind: string }>> = IN_FLIGHT_CAPABILITIES;
    for (const [kind, flags] of Object.entries(REGISTERED_KINDS)) {
        assert.equal(transcripts.exact(kind) !== undefined, flags.hasTranscript, `${kind} transcript capability`);
        assert.equal(compactionPlans.forKind(kind, '').kind === 'supported', flags.compactable, `${kind} compaction capability`);
        assert.equal(inFlight[kind]?.kind === 'supported', flags.hasTranscript, `${kind} in-flight capability`);
    }
});

test('hermes history and compaction lookups refuse with their established wording', () => {
    assert.equal(modalTranscriptRegistry().exact('hermes'), undefined);
    assert.deepEqual(compactionPlans.forKind('hermes', ''), { kind: 'unsupported', why: 'no compaction plan is registered for hermes' });
});

test('unavailable reasons name the kind for the modal and the daemon registries alike', () => {
    const screens: Screens = { readScreen: (): Promise<ScreenResult> => Promise.resolve({ kind: 'screen', text: '', revision: 1, truncated: false }) };
    const daemon = daemonTranscriptRegistry(screens, () => true);
    assert.equal(modalTranscriptRegistry().unavailableReason('hermes'), 'no reader for hermes');
    assert.equal(modalTranscriptRegistry().unavailableReason('zed'), 'no reader for zed');
    assert.equal(daemon.unavailableReason('hermes'), 'no reader for hermes');
    assert.equal(daemon.unavailableReason('zed'), 'no reader for zed');
});

test('a registered Unsupported kind answers from the capability table before a screen reader is consulted', async () => {
    const screens: Screens = { readScreen: (): Promise<ScreenResult> => Promise.resolve({ kind: 'screen', text: 'working', revision: 1, truncated: false }) };
    const hermes = lane('hermes', { pane: 'w1:p5', cwd: '/repo', session: 'h1' });
    assert.deepEqual(await skipOf(registryWith({}, new ScreenTranscripts(screens, () => true)), hermes, 'hermes'), { gate: 'in-flight', detail: 'no transcript reader for hermes' });
});

test('a registered kind with no reader in the registry names the missing transcript reader', async () => {
    const codex = lane('codex', { pane: 'w1:p5', cwd: '/repo', session: 'c1' });
    assert.deepEqual(await skipOf(registryWith({}), codex, 'codex'), { gate: 'in-flight', detail: 'no transcript reader for codex' });
});

test('a registered transcript reader without in-flight support shows its declared reason', async () => {
    const base = ROWS.find((row) => row.kind === 'codex');
    assert.ok(base);
    const why: InFlightReason = 'unregistered-reader';
    const reader: Transcripts = {
        agent: 'codex', inFlight: { kind: 'unsupported', why }, locate: (placed) => base.reader.locate(placed),
        read: (source, was, budget) => base.reader.read(source, was, budget), latestPrompt: (source, budget) => base.reader.latestPrompt(source, budget),
    };
    assert.deepEqual(await skipOf(registryWith({ codex: reader }), base.recorded, 'codex'), { gate: 'in-flight', detail: 'no transcript reader for codex' });
});

test('every BACKEND_IDS id has a maker that names itself; custom has no model or enumerator; pins today: custom label ignores model setting', () => {
    const config = { backend: 'auto', models: { claude: 'haiku', codex: '', opencode: '', hermes: '', custom: '' }, effort: 'default', customCommand: 'my-llm --model x', timeoutMs: 1000 } as unknown as Config;
    assert.deepEqual(Object.keys(MAKERS).toSorted(), [...BACKEND_IDS].toSorted());
    for (const id of BACKEND_IDS) {
        assert.equal(MAKERS[id](config, dir).id, id);
    }
    assert.equal(MODEL_DEFAULTS.custom, '');
    assert.equal(enumeratorFor({ ...config, backend: 'custom' }, ['custom'], dir), null);
    for (const id of BACKEND_IDS.filter((each) => each !== 'custom')) {
        assert.notEqual(enumeratorFor({ ...config, backend: id }, [id], dir), null, `${id} enumerates`);
    }
    const harness: Harness = new CustomHarness('my-llm --model x', dir, 1000);
    assert.equal(harness.label({ model: 'gpt-x', effort: 'high' }), 'custom/my-llm');
});

test('hermes refuses: not compactable, `no reader for hermes` in the recap, and autocompact stops the lane in-flight (with the kind enabled)', async () => {
    const hermes = lane('hermes', { pane: 'w1:p5', cwd: '/repo', session: 'h1' });
    assert.deepEqual(targetsOf([hermes], { kind: 'all' }, { pane: null, focused: null }), []);
    const world = typingFleet({ 'w1:p5': 'idle' });
    await compactionFlow(world, 'all', null, [[]], [hermes]).run({ tab: 'w1:t1', pane: null, note: null });
    assert.deepEqual(world.typed, [], 'nothing is typed into hermes');
    assert.match(world.toasts.join('\n'), /No agent here can be compacted/);

    const store = memoryStore();
    const writer: Summarizer = { backend: 'fake', contract: 'strict', write: (): Promise<Written> => Promise.resolve({ kind: 'written', text: '{"ops":[]}', costUsd: 0 }) };
    const job = new RecapJob({ writerView: (): { readonly kind: 'full' } => ({ kind: 'full' }),
        repos: NO_REPOS, transcripts: registryWith({}), records: store.records, ledger: store.ledger,
        clock: { now: (): ReturnType<typeof instant> => instant(3) }, summarizer: (): Summarizer => writer,
        language: (): string => 'en', log: (): void => undefined,
    });
    await job.refreshNow(tabId('w1:t1'), [hermes]);
    assert.match(store.records.readRecap('w1:t1')?.error ?? '', /w1:p5: no reader for hermes/);

    assert.deepEqual(await skipOf(registryWith({}), hermes, 'hermes'), { gate: 'in-flight', detail: 'no transcript reader for hermes' });
});

interface HandoffPin {
    readonly kind: 'supported';
    readonly settleMs: number;
    readonly trials: number;
    readonly locatedBy: LocatedBy;
}

interface HandoffNoPlan {
    readonly kind: 'unsupported';
    readonly reason: 'no-plan';
}

const HANDOFF_PINS = {
    claude: { kind: 'supported', settleMs: 10_000, trials: 130, locatedBy: 'session' },
    codex: { kind: 'supported', settleMs: 3_000, trials: 130, locatedBy: 'directory' },
    opencode: { kind: 'supported', settleMs: 60_000, trials: 77, locatedBy: 'directory' },
    hermes: { kind: 'unsupported', reason: 'no-plan' },
} satisfies Record<RegisteredKind, HandoffPin | HandoffNoPlan>;

function handoffRows(kind: RegisteredKind, pin: HandoffPin): void {
    const deliveryOf = (over: Partial<World> = {}): World => worldOf({ agent: kind, locatedBy: pin.locatedBy, ...over });
    const flowOf = (world: World, typing: LeaseSpy, over: Partial<FlowWorld> = {}): ReturnType<typeof handoffHarness> => handoffHarness({ targetAgent: kind, ...over }, senderOf(world, typing.port));
    const working = { kind: 'agent', agent: kind, status: 'working' } as const;

    test(`${kind} handoff: the plan is one prompt with either evidence, no retry, its settle time and its locating key`, () => {
        assert.deepEqual(handoffPlans.forKind(kind), {
            kind: 'supported',
            plan: { delivery: 'prompt', evidence: 'either', retry: 'none', settle: { after: duration(pin.settleMs), evidence: { trials: pin.trials, source: SETTLE_SOURCE } }, locatedBy: pin.locatedBy },
        });
    });

    test(`${kind} handoff: a delivered text is one prompt with no wait or stall, under a lease taken at once and released, held for the settle time, and confirmed by its transcript at the first look`, async () => {
        const world = echoing(deliveryOf({ latest: 'older' }));
        const typing = leaseSpy('taken');
        const h = flowOf(world, typing);
        assert.deepEqual(await h.flow.run(request()), { kind: 'delivered' });
        assert.deepEqual(typing.acquired, [['w1:p2', 0]]);
        assert.deepEqual(typing.released, ['w1:p2']);
        assert.deepEqual(world.sent, [{ pane: 'w1:p2', text: TEXT, wait: undefined, behavior: { acceptsStall: false } }]);
        assert.deepEqual(h.pauses, [pin.settleMs]);
        assert.deepEqual(world.pauses, [HANDOFF_OBSERVE_MS]);
    });

    test(`${kind} handoff: a send that throws is failed transport, is sent once, and releases the lease`, async () => {
        const world = deliveryOf({ faults: { prompt: true } });
        const typing = leaseSpy('taken');
        assert.deepEqual(await flowOf(world, typing).flow.run(request()), { kind: 'failed', reason: 'transport' });
        assert.equal(world.sent.length, 1);
        assert.deepEqual(world.pauses, []);
        assert.deepEqual(typing.released, ['w1:p2']);
    });

    test(`${kind} handoff: a target that reports blocked when the text is sent is refused status-not-ready and never confirmed`, async () => {
        const world = deliveryOf({ sendReply: { kind: 'blocked' } });
        assert.deepEqual(await flowOf(world, leaseSpy('taken')).flow.run(request()), { kind: 'refused', reason: 'status-not-ready' });
        assert.equal(world.sent.length, 1);
        assert.deepEqual(world.pauses, []);
    });

    test(`${kind} handoff: an earlier handoff with the same text is not mistaken for this one, and confirmation gives up after HANDOFF_OBSERVATIONS looks, one second apart, without a second send`, async () => {
        const world = deliveryOf({ latest: TEXT });
        assert.deepEqual(await flowOf(world, leaseSpy('taken')).flow.run(request()), { kind: 'failed', reason: 'unconfirmed' });
        assert.deepEqual(world.pauses, Array.from({ length: HANDOFF_OBSERVATIONS }, () => HANDOFF_OBSERVE_MS));
        assert.equal(world.sent.length, 1);
    });

    test(`${kind} handoff: a newer prompt that is not this handoff does not confirm it`, async () => {
        const world = deliveryOf({ latest: 'older' });
        world.onPause = (count: number): void => {
            if (count === 1) {
                world.latest = 'an unrelated prompt typed after the handoff';
            }
        };
        assert.deepEqual(await flowOf(world, leaseSpy('taken')).flow.run(request()), { kind: 'failed', reason: 'unconfirmed' });
        assert.equal(world.pauses.length, HANDOFF_OBSERVATIONS);
    });

    test(`${kind} handoff: a throw while reading confirmation evidence is failed unconfirmed, not transport, and the text is not sent again`, async () => {
        const world = deliveryOf({ latest: 'older', faults: { status: true } });
        assert.deepEqual(await flowOf(world, leaseSpy('taken')).flow.run(request()), { kind: 'failed', reason: 'unconfirmed' });
        assert.equal(world.sent.length, 1);
    });

    test(`${kind} handoff: a fresh lane whose transcript appears during the looks is found by re-locating and delivered`, async () => {
        const world = deliveryOf({ located: false, latest: null });
        world.onPause = (count: number): void => {
            if (count === 2) {
                world.located = true;
                world.latest = TEXT;
            }
        };
        assert.deepEqual(await flowOf(world, leaseSpy('taken')).flow.run(request()), { kind: 'delivered' });
        assert.equal(world.pauses.length, 2);
    });

    test(`${kind} handoff: a second lane of this kind in the same directory makes the directory transcript shared, so only status confirms when the kind is located by directory`, async () => {
        const shared = pin.locatedBy === 'directory';
        const idle = echoing(deliveryOf({ latest: 'older' }));
        assert.deepEqual(await flowOf(idle, leaseSpy('taken'), { peer: true }).flow.run(request()), shared ? { kind: 'failed', reason: 'unconfirmed' } : { kind: 'delivered' });
        const busy = echoing(deliveryOf({ latest: 'older', agentState: working }));
        assert.deepEqual(await flowOf(busy, leaseSpy('taken'), { peer: true }).flow.run(request()), { kind: 'delivered' });
    });

    test(`${kind} handoff: a target whose locating key is not known is confirmed by status only`, async () => {
        const idle = echoing(deliveryOf({ latest: 'older', session: null }));
        assert.deepEqual(await flowOf(idle, leaseSpy('taken'), { targetKeyKnown: false }).flow.run(request()), { kind: 'failed', reason: 'unconfirmed' });
        const busy = echoing(deliveryOf({ latest: 'older', session: null, agentState: working }));
        assert.deepEqual(await flowOf(busy, leaseSpy('taken'), { targetKeyKnown: false }).flow.run(request()), { kind: 'delivered' });
    });

    test(`${kind} handoff: a target that is not ready starts no refresh, reads nothing and takes no claim`, async () => {
        const h = handoffHarness({ targetAgent: kind, targetStatus: 'working' });
        assert.deepEqual(await h.flow.run(request({ refreshFirst: true })), { kind: 'refused', reason: 'status-not-ready' });
        assert.deepEqual(h.calls, []);
        assert.equal(h.claims.has(String(TARGET)), false);
    });

    test(`${kind} handoff: a compaction already holding the target starts no refresh`, async () => {
        const h = handoffHarness({ targetAgent: kind });
        h.claims.claim(String(TARGET), 'compaction');
        assert.deepEqual(await h.flow.run(request({ refreshFirst: true })), { kind: 'refused', reason: 'lane-busy' });
        assert.equal(h.calls.some((call) => call.startsWith('refresh')), false);
    });

    test(`${kind} handoff: a refresh that gives a lane its first ledger renders the facts it produced`, async () => {
        const f = fact('f1', 'goal', 'Ship the parser', NOW - 1000, { task: T1 });
        const h = handoffHarness({ targetAgent: kind, recap: recapOf(), facts: [f], onRefresh: (): void => { h.world.recap = SOURCE_LISTED(); } });
        assert.deepEqual(await h.flow.run(request({ refreshFirst: true })), { kind: 'delivered' });
        assert.deepEqual(h.renders.map((input) => input.facts), [[f]]);
    });

    test(`${kind} handoff: a refresh that moves the source lane to another task renders that task`, async () => {
        const f = fact('f2', 'goal', 'Ship the writer', NOW - 1000, { task: { tab: TAB, key: 't2' } });
        const h = handoffHarness({ targetAgent: kind, facts: [f], onRefresh: (): void => { h.world.recap = recapOf(task('t2', ['w1:p1'])); } });
        assert.deepEqual(await h.flow.run(request({ refreshFirst: true })), { kind: 'delivered' });
        assert.deepEqual(h.renders.map((input) => input.facts), [[f]]);
    });

    test(`${kind} handoff: a target that turns working during the refresh is refused status-not-ready and nothing is typed`, async () => {
        const world = deliveryOf({ latest: 'older' });
        const typing = leaseSpy('taken');
        const h = handoffHarness({ targetAgent: kind, onRefresh: (): void => { h.world.targetStatus = 'working'; } }, senderOf(world, typing.port));
        assert.deepEqual(await h.flow.run(request({ refreshFirst: true })), { kind: 'refused', reason: 'status-not-ready' });
        assert.deepEqual(world.sent, []);
        assert.deepEqual(typing.acquired, []);
    });
}

test('handoff confirmation is pinned to 20 looks, one second apart, for every kind', () => {
    assert.deepEqual([HANDOFF_OBSERVATIONS, HANDOFF_OBSERVE_MS], [20, 1000]);
});

for (const kind of Object.keys(HANDOFF_PINS) as RegisteredKind[]) {
    const pin = HANDOFF_PINS[kind];
    if (pin.kind === 'supported') {
        handoffRows(kind, pin);
    } else {
        test(`${kind} handoff: no plan is ${pin.kind} ${pin.reason} through the registry, and the flow types nothing`, async () => {
            assert.deepEqual(handoffPlans.forKind(kind), { kind: 'unsupported', reason: pin.reason });
            const h = handoffHarness({ targetAgent: kind });
            assert.deepEqual(await h.flow.run(request()), { kind: 'unsupported', reason: 'no-plan' });
            assert.deepEqual(h.sent, []);
        });
    }
}
