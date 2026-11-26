import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scratchStore, type Scratch } from '#src/adapters/db/scratch.ts';
import { PREFIXES } from '#src/adapters/db/typeid.ts';
import { RUBRIC } from '#src/adapters/job/prompts/rubric.ts';
import { SystemClock } from '#src/adapters/os/system-clock.ts';
import { loadSettings } from '#src/daemon/config.ts';
import { curationOf } from '#src/daemon/curate.ts';
import { wireEngine } from '#src/daemon/engine-wire.ts';
import { scopeOf } from '#src/engine/engine-adapter.ts';
import { parseHarnessKind, parseSessionKey, type Engine, type ScopeId } from '@stateforge-labs/session-ledger';
import type { Curating } from '@stateforge-labs/session-ledger';
import type { LegacyWriter as Writer } from '@stateforge-labs/session-ledger';
import type { Curated, Curators } from '@stateforge-labs/session-ledger';
import type { Clock } from '@stateforge-labs/session-ledger';
import type { Store } from '#src/adapters/db/database.ts';
import type { LegacySessionReader as SessionReader, ChunkResult, Entry } from '@stateforge-labs/session-ledger';
import { grewOf, sourcePathOf, UNREAD } from '@stateforge-labs/session-ledger';
import { exitCodeOf, unknown, type Unknown } from '@stateforge-labs/session-ledger';
import { must as mustOf } from '@stateforge-labs/session-ledger';
import { CurateTasks, type CurateDeps, type RecapWritten } from '#src/recap/application/curate.ts';
import { EventStream } from '#src/recap/application/lane-events.ts';
import { tailOf } from '#src/recap/application/transcript-tail.ts';
import { brand } from '@stateforge-labs/session-ledger';
import { emptyBoard } from '#src/recap/domain/board.ts';
import { parseCount } from '@stateforge-labs/session-ledger';
import { instant } from '@stateforge-labs/session-ledger';
import { parseText, textOf } from '@stateforge-labs/session-ledger';
import type { Text } from '@stateforge-labs/session-ledger';
import { tabId } from '#test/support/ids.ts';
import { cursor, recordOps } from '#test/db/support.ts';
import { causeOf } from '#test/fakes/cause.ts';
import { registryWith } from '#test/fakes/transcript-registry.ts';
import { writer as goldenWriter } from '#test/fakes/golden-writer.ts';
import { NO_REPOS } from '#test/support.ts';
import { usdOf } from '@stateforge-labs/session-ledger';
import { paneIdOf } from '#src/recap/domain/ids.ts';

const MIN = 60_000;
const NOW = Date.parse('2026-10-07T16:30:00Z');
const T = 'w1:t1';
const ID_PATTERN = new RegExp(`\\b(${Object.values(PREFIXES).join('|')})_[0-9a-z]{26}\\b`, 'g');

type Plain = string | number | boolean | null | readonly Plain[] | { readonly [key: string]: Plain };

const saying = (body: object): Curated => ({ kind: 'curated', text: textOf(JSON.stringify(body)) });
const silent = (): Curated => unknown({ why: 'failed', code: exitCodeOf(1), detail: causeOf('no answer') });
const MERGE_AB = { op: 'close', id: 'f1', why: 'merged', into: 'f2' };
const REFUSED = { op: 'close', id: 'f9', why: 'merged', into: 'f2' };
const UPDATE_F1 = { op: 'update', id: 'f1', text: 'Running the migration tests, all pass', evidence: 'The migration tests pass' };
const UPDATE_F1_AGAIN = { op: 'update', id: 'f1', text: 'The migration tests all pass', evidence: 'The migration tests pass' };

interface Seed { readonly task: string; readonly section: 'goal' | 'now' | 'done' | 'needs'; readonly text: string; readonly minutes: number }

const seeded = (task: string, section: Seed['section'], text: string, minutes: number): Seed => ({ task, section, text, minutes });
const ONE: readonly Seed[] = [seeded('t1', 'now', 'Running the migration tests', 30), seeded('t1', 'now', 'Running tests of the migration', 29), seeded('t1', 'done', 'Wrote migration 007', 28)];
const TWO: readonly Seed[] = [...ONE, seeded('t2', 'now', 'Drafting the release notes', 27), seeded('t2', 'needs', 'Which branch ships?', 26)];

interface FollowedSession { readonly pane: string; readonly tail: readonly Entry[] | null }

const entry = (role: 'user' | 'agent', text: string, minutesAgo: number | null): Entry => ({ role, text: textOf(text), ...(minutesAgo === null ? {} : { at: instant(NOW - minutesAgo * MIN) }) });
const TAIL_A: readonly Entry[] = [entry('agent', 'Which branch ships?', 20), entry('user', 'Ship from release/2.1.', 19), entry('agent', 'The migration tests pass.', 5)];
const TAIL_B: readonly Entry[] = [entry('user', 'Draft the notes.', 21), entry('agent', 'Notes drafted.', 4)];

interface Plan {
    readonly seeds?: readonly Seed[];
    readonly lanes?: readonly FollowedSession[];
    readonly repair?: 'once';
    readonly every?: number;
    readonly curator?: 'present' | 'absent';
    readonly recap?: 'unknown';
    readonly facts?: 'unknown';
}

type Step =
    | { readonly do: 'request' }
    | { readonly do: 'after'; readonly turns: number; readonly boundary?: boolean }
    | { readonly do: 'answers'; readonly queue: readonly (Curated | 'throws')[] }
    | { readonly do: 'later'; readonly minutes: number }
    | { readonly do: 'curator'; readonly is: 'present' | 'absent' };

interface Fixture { readonly name: string; readonly plan: Plan; readonly steps: readonly Step[] }

interface Observed {
    readonly calls: readonly { readonly mode: string; readonly document: string }[];
    readonly dumps: readonly string[];
    readonly logs: readonly string[];
}

interface Seam {
    request(): Promise<void>;
    after(event: RecapWritten): Promise<void>;
}

interface World {
    readonly scratch: Scratch;
    readonly store: Store;
    readonly clock: { now: number };
    readonly calls: { mode: string; document: string }[];
    readonly logs: string[];
    readonly queue: (Curated | 'throws')[];
    readonly slot: { present: boolean };
    readonly curators: () => Curators | null;
    readonly transcripts: ReturnType<typeof registryWith>;
}

const stable = (text: string): string => {
    const seen = new Map<string, string>();
    return text.replace(ID_PATTERN, (id: string, prefix: string) => {
        const known = seen.get(id) ?? `${prefix}_#${[...seen.keys()].filter((each) => each.startsWith(`${prefix}_`)).length + 1}`;
        seen.set(id, known);
        return known;
    });
};

const readerOf = (lanes: readonly FollowedSession[]): SessionReader => ({
    agent: mustOf(parseHarnessKind('claude')),
    inFlight: { kind: 'unsupported', why: 'in-flight-unavailable' },
    locate: (lane) => Promise.resolve({ kind: 'located', source: sourcePathOf(`/t/${lane.key}`) }),
    latestPrompt: () => Promise.resolve({ kind: 'prompt', text: null }),
    read: (source): Promise<ChunkResult> => {
        const lane = lanes.find((each) => `/t/${each.pane}` === source);
        return Promise.resolve({ kind: 'chunk', entries: lane?.tail ?? [], title: null, lastPrompt: null, harnessRecap: null, notes: [], position: UNREAD, grew: grewOf(false) });
    },
});

const unreadable = (): Unknown => unknown({ why: 'unreadable', detail: causeOf('the store did not answer') });

function seedStore(store: Store, seeds: readonly Seed[], lanes: readonly FollowedSession[]): void {
    const ids = [...new Set(seeds.map((each) => each.task))];
    const shapes = ids.map((id) => ({ id: textOf(id), name: textOf(''), sessions: lanes.map((lane) => paneIdOf(lane.pane)) }));
    for (const one of seeds.toSorted((a, b) => b.minutes - a.minutes)) {
        recordOps(store, {
            scope: tabId(T), at: instant(NOW - one.minutes * MIN), cause: 'turn-ended', backend: textOf('fake'), language: textOf('en'), costUsd: usdOf(0), error: null,
            sessions: lanes.map((lane) => cursor(lane.pane)), tasks: shapes,
            ops: [{ task: textOf(one.task), ops: [{ op: 'add', section: one.section, text: textOf(one.text), why: null, ref: null, at: instant(NOW - one.minutes * MIN), agent: null }] }],
        });
    }
}

function worldOf(plan: Plan): World {
    const scratch = scratchStore();
    const lanes = plan.lanes ?? [{ pane: 'w1:p1', tail: TAIL_A }];
    seedStore(scratch.store, plan.seeds ?? ONE, lanes);
    const { store } = scratch;
    const faulty: Store = {
        ...store,
        records: plan.recap === 'unknown' ? Object.assign(Object.create(store.records) as Store['records'], { readRecap: (): Unknown => unreadable() }) : store.records,
        ledger: plan.facts === 'unknown' ? Object.assign(Object.create(store.ledger) as Store['ledger'], { allOf: (): Unknown => unreadable() }) : store.ledger,
    };
    const calls: World['calls'] = [];
    const queue: World['queue'] = [];
    const slot = { present: plan.curator !== 'absent' };
    const curators = (): Curators | null => (slot.present
        ? { backend: mustOf(parseText('fake/test')), write: (document, mode): Promise<Curated> => {
            calls.push({ mode: mode ?? '(none)', document });
            const next = queue.shift();
            return next === 'throws' ? Promise.reject(new Error('the curator fell over')) : Promise.resolve(next ?? silent());
        } }
        : null);
    return { scratch, store: faulty, clock: { now: NOW }, calls, queue, logs: [], slot, curators, transcripts: registryWith({ claude: readerOf(lanes) }) };
}

const clockOf = (world: World): Clock => ({ now: () => instant(world.clock.now) });

const logOf = (world: World) => (line: Text): void => { world.logs.push(line); };

function baseSeam(world: World): Seam {
    const log = logOf(world);
    const deps: CurateDeps = {
        records: world.store.records, ledger: world.store.ledger, stories: world.store.stories, writer: world.curators, clock: () => instant(world.clock.now),
        zone: () => mustOf(parseText(Intl.DateTimeFormat().resolvedOptions().timeZone)), language: () => mustOf(parseText(loadSettings().recapLanguage)), rubric: RUBRIC.items,
        tail: (lanes) => tailOf(world.transcripts, lanes), every: () => mustOf(parseCount(loadSettings().reconcileEvery)), repair: () => loadSettings().curatorRepair, log,
    };
    const tasks = new CurateTasks(deps);
    return {
        request: () => tasks.run(tabId(T)),
        after: async (event) => {
            try { await tasks.afterRun(event); } catch (error) { log(textOf(`curator ${event.scope}: ${error instanceof Error ? error.message : String(error)}`)); }
        },
    };
}

interface Head {
    readonly engine: Engine;
    readonly curation: Curating;
    readonly scope: ScopeId;
}

function headOf(world: World, summarizer: Writer = goldenWriter().summarizer): Head {
    const log = logOf(world);
    const clock = clockOf(world);
    const curation = curationOf({ store: world.store, curator: world.curators, transcripts: world.transcripts, clock, log });
    const parts: ConstructorParameters<typeof EventStream>[0] = { tokens: { report: () => Promise.resolve({ kind: 'done' }) }, workspaces: { reportWorkspace: () => Promise.resolve({ kind: 'done' }), workspaces: () => Promise.resolve({ kind: 'workspaces', ids: [] }) }, enabled: () => 'absent', startedAt: instant(1), log  };
    const events = new EventStream(parts);
    const { engine } = wireEngine({
        store: world.store, backends: { summarizer: () => summarizer, enumerator: () => null }, transcripts: world.transcripts, clock, repos: NO_REPOS, curation, events,
        board: emptyBoard, ledger: () => undefined, log,
    });
    const scope = scopeOf(tabId(T));
    if (scope === null) {
        throw new Error('the fixture tab is a scope');
    }
    return { engine, curation, scope };
}

function headSeam(world: World): Seam {
    const log = logOf(world);
    const { engine, curation, scope } = headOf(world);
    return {
        request: () => engine.curate(scope),
        after: async (event) => {
            try { await curation.afterRun(scope, event); } catch (error) { log(textOf(`curator ${scope}: ${error instanceof Error ? error.message : String(error)}`)); }
        },
    };
}

function rowsOf(store: Store, name: string): Plain[] {
    try {
        return store.db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all() as Plain[];
    } catch {
        const key = (store.db.prepare(`PRAGMA table_info("${name}")`).all() as { name: string; pk: number }[]).filter((column) => column.pk > 0).toSorted((a, b) => a.pk - b.pk).map((column) => `"${column.name}"`);
        return store.db.prepare(`SELECT * FROM "${name}" ORDER BY ${key.join(', ')}`).all() as Plain[];
    }
}

function dumpOf(store: Store): string {
    const tables = (store.db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]).map((row) => row.name);
    const blobs = new Map<string, string>();
    const replacer = (_key: string, value: unknown): unknown => {
        if (value instanceof Uint8Array) {
            const hex = Buffer.from(value).toString('hex');
            const known = blobs.get(hex) ?? `blob#${blobs.size + 1}`;
            blobs.set(hex, known);
            return known;
        }
        return value;
    };
    return stable(JSON.stringify(tables.map((name): Plain => ({ [name]: rowsOf(store, name) })), replacer));
}

const SETTINGS = { TAB_RECAP_RECONCILE_EVERY: 'every', TAB_RECAP_CURATOR_REPAIR: 'repair', TAB_RECAP_RECAP_LANG: 'language' } as const;

async function applied(step: Step, world: World, driven: Seam): Promise<void> {
    switch (step.do) {
        case 'request': await driven.request(); break;
        case 'after': await driven.after({ scope: tabId(T), turns: brand<number, 'Count'>(step.turns), boundary: brand<boolean, 'Boundary'>(step.boundary === true), cause: textOf('turn-ended') }); break;
        case 'answers': world.queue.push(...step.queue); break;
        case 'later': world.clock.now += step.minutes * MIN; break;
        case 'curator': world.slot.present = step.is === 'present'; break;
    }
}

function restored(saved: Record<string, string | undefined>): void {
    for (const [name, value] of Object.entries(saved)) {
        if (value === undefined) {
            delete process.env[name];
        } else {
            process.env[name] = value;
        }
    }
}

async function observe(fixture: Fixture, seam: (world: World) => Seam): Promise<Observed> {
    const world = worldOf(fixture.plan);
    const saved = Object.fromEntries(Object.keys(SETTINGS).map((name) => [name, process.env[name]]));
    process.env['TAB_RECAP_RECONCILE_EVERY'] = String(fixture.plan.every ?? 10);
    process.env['TAB_RECAP_CURATOR_REPAIR'] = fixture.plan.repair ?? 'off';
    process.env['TAB_RECAP_RECAP_LANG'] = 'en';
    try {
        const driven = seam(world);
        const dumps: string[] = [dumpOf(world.store)];
        for (const step of fixture.steps) {
            await applied(step, world, driven);
            dumps.push(dumpOf(world.store));
        }
        return { calls: world.calls.map((call) => ({ mode: call.mode, document: stable(call.document) })), dumps, logs: world.logs.map(stable) };
    } finally {
        restored(saved);
        world.scratch.dispose();
    }
}

const FIXTURES: readonly Fixture[] = [
    { name: 'F1 an open request, one task, the story written', plan: {}, steps: [{ do: 'answers', queue: [saying({ story: 'The migration is written; its tests run.' })] }, { do: 'request' }] },
    { name: 'F2 an open request with merges and a refused merge', plan: {}, steps: [{ do: 'answers', queue: [saying({ ops: [MERGE_AB, REFUSED], story: 'Merged one and refused one.' })] }, { do: 'request' }] },
    { name: 'F3 story repair once: refused first answer repaired; repair not JSON', plan: { repair: 'once' }, steps: [
        { do: 'answers', queue: [saying({ ops: [REFUSED], story: 'first' }), saying({ ops: [], story: 'Repaired.' })] }, { do: 'request' }, { do: 'later', minutes: 6 },
        { do: 'answers', queue: [saying({ ops: [REFUSED], story: 'second' }), { kind: 'curated', text: textOf('not json at all') }] }, { do: 'request' },
    ] },
    { name: 'F4 the curator answers unknown', plan: {}, steps: [{ do: 'answers', queue: [silent()] }, { do: 'request' }] },
    { name: 'F5 no curator backend', plan: { curator: 'absent' }, steps: [{ do: 'request' }, { do: 'after', turns: 1 }] },
    { name: 'F5b no curator backend and an unknown facts read', plan: { curator: 'absent', facts: 'unknown', every: 1 }, steps: [{ do: 'request' }, { do: 'after', turns: 1 }] },
    { name: 'F6 a second request inside five minutes, and one right after an after-run reconcile', plan: { every: 1 }, steps: [
        { do: 'answers', queue: [saying({ story: 'one' }), saying({ story: 'two' }), saying({ ops: [] })] }, { do: 'request' }, { do: 'later', minutes: 1 }, { do: 'request' }, { do: 'later', minutes: 6 },
        { do: 'after', turns: 1 }, { do: 'request' }, { do: 'later', minutes: 6 }, { do: 'request' },
    ] },
    { name: 'F7 after-run: reconcile every 3 runs writes no story, the counter restarts', plan: { every: 3 }, steps: [
        { do: 'answers', queue: [saying({ ops: [] }), saying({ ops: [] })] }, { do: 'after', turns: 1 }, { do: 'after', turns: 1 }, { do: 'after', turns: 1 }, { do: 'after', turns: 1 }, { do: 'after', turns: 1 }, { do: 'after', turns: 1 },
    ] },
    { name: 'F8 after-run with a boundary', plan: { every: 5 }, steps: [{ do: 'answers', queue: [saying({ ops: [] })] }, { do: 'after', turns: 1, boundary: true }, { do: 'after', turns: 1 }] },
    { name: 'F9 two tasks, two lanes, the tail from both', plan: { seeds: TWO, lanes: [{ pane: 'w1:p1', tail: TAIL_A }, { pane: 'w1:p2', tail: TAIL_B }], every: 1 }, steps: [
        { do: 'answers', queue: [saying({ story: 'one' }), saying({ story: 'two' }), saying({ ops: [] }), saying({ ops: [] })] }, { do: 'request' }, { do: 'later', minutes: 6 }, { do: 'after', turns: 1 },
    ] },
    { name: 'F10 an unknown recap read, an unknown facts read', plan: { recap: 'unknown' }, steps: [{ do: 'request' }, { do: 'after', turns: 1 }] },
    { name: 'F10b an unknown facts read', plan: { facts: 'unknown' }, steps: [{ do: 'answers', queue: [saying({ story: 'x' })] }, { do: 'request' }] },
    { name: 'F11 one lane, a transcript tail with an entry with no at between dated ones', plan: { every: 1, lanes: [{ pane: 'w1:p1', tail: [entry('user', 'First.', 20), entry('agent', 'Undated.', null), entry('agent', 'Later.', 10), entry('agent', 'Earlier than later.', 15)] }] }, steps: [
        { do: 'answers', queue: [saying({ ops: [] })] }, { do: 'after', turns: 1 },
    ] },
    { name: 'F12 the curator is null for some runs, then present', plan: { every: 3, curator: 'absent' }, steps: [
        { do: 'after', turns: 1 }, { do: 'after', turns: 1 }, { do: 'curator', is: 'present' }, { do: 'answers', queue: [saying({ ops: [UPDATE_F1] })] }, { do: 'after', turns: 1 }, { do: 'after', turns: 1 },
    ] },
    { name: 'F13 the curator throws after a reconcile kept rows', plan: { every: 2 }, steps: [
        { do: 'after', turns: 1 },
        { do: 'answers', queue: [saying({ ops: [UPDATE_F1] }), 'throws'] }, { do: 'request' }, { do: 'later', minutes: 6 },
        { do: 'answers', queue: [saying({ ops: [UPDATE_F1_AGAIN] })] }, { do: 'after', turns: 1 },
    ] },
];

const documentsOf = (seen: Observed): readonly string[] => seen.calls.map((call) => call.document);
const modesOf = (seen: Observed): readonly string[] => seen.calls.map((call) => call.mode);

const asBase = (modes: readonly string[]): readonly string[] => modes.map((mode) => (mode === '(none)' ? 'story' : mode));

function assertEqual(head: Observed, base: Observed): void {
    assert.deepEqual(head.dumps, base.dumps, 'the stored rows after every step');
    assert.deepEqual(documentsOf(head), documentsOf(base), 'the documents the curator received');
    assert.deepEqual(modesOf(head), asBase(modesOf(base)), 'the modes: the plugin names none for the story, the engine names story, which is the backend default');
    assert.deepEqual(head.logs, base.logs, 'the log lines');
}

for (const fixture of FIXTURES) {
    test(fixture.name, async () => {
        const base = await observe(fixture, baseSeam);
        const head = await observe(fixture, headSeam);
        assert.ok(!modesOf(head).includes('(none)'), 'the engine always names the mode');
        assertEqual(head, base);
    });
}

const named = (prefix: string): Fixture => {
    const one = FIXTURES.find((each) => each.name.startsWith(prefix));
    assert.ok(one !== undefined);
    return one;
};

const turnsOf = (document: string): readonly string[] => [...(/<tail[^>]*>([\s\S]*?)<\/tail>/u.exec(document)?.[1] ?? '').matchAll(/<turn [^>]*>([^<]*)<\/turn>/gu)].map((match) => match[1] ?? '');

test('K2 tail order: one lane keeps the transcript order, undated entries included, on both seams', async () => {
    const [base, head] = [await observe(named('F11'), baseSeam), await observe(named('F11'), headSeam)];
    assert.deepEqual([base.calls.length, head.calls.length], [1, 1]);
    const order = ['First.', 'Undated.', 'Later.', 'Earlier than later.'];
    assert.deepEqual([turnsOf(documentsOf(base)[0] ?? ''), turnsOf(documentsOf(head)[0] ?? '')], [order, order]);
});

test('K3 turn count: runs while the curator is null still count, so the first run with a curator reconciles on both seams', async () => {
    const [base, head] = [await observe(named('F12'), baseSeam), await observe(named('F12'), headSeam)];
    assert.deepEqual([modesOf(base), modesOf(head)], [['reconcile'], ['reconcile']]);
    assert.notDeepEqual(base.dumps.at(-1), base.dumps[0], 'the reconcile answer changed rows');
});

test('K4 settle: a story step that throws leaves the task unsettled on both seams, so the next run reconciles again', async () => {
    const [base, head] = [await observe(named('F13'), baseSeam), await observe(named('F13'), headSeam)];
    assert.deepEqual([modesOf(base), modesOf(head)], [['reconcile', '(none)', 'reconcile'], ['reconcile', 'story', 'reconcile']]);
});

test('the daemon clock the curation reads is Date.now', () => {
    const [low, at, high] = [Date.now(), Number(new SystemClock().now()), Date.now()];
    assert.ok(low <= at && at <= high);
});

async function settled(world: World, until: () => boolean): Promise<void> {
    for (let turn = 0; turn < 400 && !until(); turn += 1) {
        await new Promise((resolve) => { setImmediate(resolve); });
    }
}

async function withSettings<T>(every: number, body: () => Promise<T>): Promise<T> {
    const saved = Object.fromEntries(Object.keys(SETTINGS).map((name) => [name, process.env[name]]));
    Object.assign(process.env, { TAB_RECAP_RECONCILE_EVERY: String(every), TAB_RECAP_CURATOR_REPAIR: 'off', TAB_RECAP_RECAP_LANG: 'en' });
    try {
        return await body();
    } finally {
        restored(saved);
    }
}

const FOLLOWED = { key: mustOf(parseSessionKey('w1:p1')), harness: mustOf(parseHarnessKind('claude')), session: null, cwd: null, title: null };

function baseEngineOf(world: World): Head {
    const log = logOf(world);
    const clock = clockOf(world);
    const deps: CurateDeps = {
        records: world.store.records, ledger: world.store.ledger, stories: world.store.stories, writer: world.curators, clock: () => instant(world.clock.now),
        zone: () => mustOf(parseText(Intl.DateTimeFormat().resolvedOptions().timeZone)), language: () => mustOf(parseText(loadSettings().recapLanguage)), rubric: RUBRIC.items,
        tail: (lanes) => tailOf(world.transcripts, lanes), every: () => mustOf(parseCount(loadSettings().reconcileEvery)), repair: () => loadSettings().curatorRepair, log,
    };
    const tasks = new CurateTasks(deps);
    const idle: Curating = { request: () => Promise.resolve(), afterRun: () => Promise.resolve() };
    const parts: ConstructorParameters<typeof EventStream>[0] = { tokens: { report: () => Promise.resolve({ kind: 'done' }) }, workspaces: { reportWorkspace: () => Promise.resolve({ kind: 'done' }), workspaces: () => Promise.resolve({ kind: 'workspaces', ids: [] }) }, enabled: () => 'absent', startedAt: instant(1), log };
    const { engine } = wireEngine({
        store: world.store, backends: { summarizer: () => goldenWriter().summarizer, enumerator: () => null }, transcripts: world.transcripts, clock, repos: NO_REPOS, curation: idle, events: new EventStream(parts),
        board: emptyBoard, log,
        ledger: (event): void => {
            if (event.kind === 'recap-written') {
                const run: RecapWritten = { scope: tabId(event.scope), turns: brand<number, 'Count'>(event.turns), boundary: brand<boolean, 'Boundary'>(event.boundary), ...(event.cause === undefined ? {} : { cause: textOf(event.cause) }) };
                tasks.afterRun(run).catch((error: unknown) => { log(textOf(`curator ${event.scope}: ${error instanceof Error ? error.message : String(error)}`)); });
            }
        },
    });
    const scope = scopeOf(tabId(T));
    if (scope === null) {
        throw new Error('the fixture tab is a scope');
    }
    return { engine, curation: idle, scope };
}

test('the engine itself starts the after-run reconcile on a written run, once, as base did from its run hook', async () => {
    const seen: Record<string, unknown[]> = {};
    await withSettings(1, async () => {
        for (const side of ['base', 'head'] as const) {
            const world = worldOf({ every: 1 });
            world.queue.push(saying({ ops: [UPDATE_F1] }), saying({ ops: [] }));
            try {
                const { engine, scope } = side === 'base' ? baseEngineOf(world) : headOf(world);
                engine.follow(scope, FOLLOWED);
                await engine.refresh(scope);
                await settled(world, () => world.calls.length > 0);
                await settled(world, () => false);
                seen[side] = [modesOf({ calls: world.calls, dumps: [], logs: [] }), world.calls.map((call) => stable(call.document)), dumpOf(world.store), world.logs.map(stable)];
            } finally {
                world.scratch.dispose();
            }
        }
    });
    assert.deepEqual(seen['head']?.[0], ['reconcile'], 'one reconcile prompt, so the after-run ran once');
    assert.deepEqual(seen['head'], seen['base']);
});

const PASSING: Writer = {
    backend: textOf('fake'),
    contract: 'strict',
    write: () => Promise.resolve({ kind: 'written', text: textOf(JSON.stringify({ ops: [{ op: 'add', task: 't1', section: 'done', text: 'The migration tests pass', anchor: 'The migration tests pass.' }] })), costUsd: usdOf(0) }),
};

test('F14 and K5: a recap run pending when the request arrives finishes before the curator reads facts; the old plugin path started at once', async () => {
    const asked: Record<string, unknown[]> = {};
    for (const side of ['base', 'head'] as const) {
        const world = worldOf({ every: 10 });
        world.queue.push(saying({ story: 'x' }), saying({ story: 'y' }));
        try {
            const head = headOf(world, PASSING);
            head.engine.follow(head.scope, FOLLOWED);
            const refreshing = head.engine.refresh(head.scope);
            const requesting = side === 'base' ? baseSeam(world).request() : head.engine.curate(head.scope);
            for (let turn = 0; turn < 200; turn += 1) {
                await Promise.resolve();
            }
            const before = world.calls.length;
            await Promise.all([refreshing, requesting]);
            asked[side] = [before, world.calls.length, world.calls.map((call) => stable(call.document)), dumpOf(world.store), world.logs.map(stable)];
        } finally {
            world.scratch.dispose();
        }
    }
    assert.deepEqual([asked['base']?.slice(0, 2), asked['head']?.slice(0, 2)], [[2, 2], [0, 2]], 'K5: the curator waits for the pending recap run, as CUR-6 requires; the old plugin path did not');
    const fresh = (side: string): readonly boolean[] => ((asked[side]?.[2] ?? []) as readonly string[]).map((document) => document.includes('>The migration tests pass</fact>'));
    assert.deepEqual([fresh('base'), fresh('head')], [[false, false], [true, true]], 'K5: the curator sees the fact the pending run wrote, because it read facts after that run finished');
});
