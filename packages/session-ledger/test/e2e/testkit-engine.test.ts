import assert from 'node:assert/strict';
import { test } from 'node:test';
import { instant, type Fact, type Operation, type RecapRequest, type RunId, type RunRef, type Unknown } from '@stateforge-labs/session-ledger';
import {
    createEngineWorld,
    createFakeEngine,
    createMemoryStore,
    directory,
    duration,
    engineCases,
    factOf,
    followed,
    harness,
    key,
    restore,
    runConformance,
    scope,
    session,
    type EngineWorld,
    type FakeEngine,
    type Fold,
    type StoreUnderTest,
    type Subject,
} from '@stateforge-labs/session-ledger/testkit';

const request = (): RecapRequest => ({
    input: { tab: { id: 'tab-1', now: 0, zone: 'UTC' }, agents: [], tasks: [], ledgers: [], notes: [], transcripts: [] },
    language: 'en',
    previousLanguage: 'en',
});

const listed = (value: readonly Fact[] | Unknown): readonly Fact[] => {
    if (Array.isArray(value)) {
        return value;
    }
    throw new Error('the read was unknown');
};

const taskA = { tab: 'tab-1', key: 'a' };

test('a directory is the path it was given', () => {
    assert.equal(String(directory('/work')), '/work');
});

test('a duration is the whole milliseconds it was given, and a negative or fractional one is refused', () => {
    assert.equal(Number(duration(2500)), 2500);
    assert.throws(() => duration(-1), /duration/);
    assert.throws(() => duration(1.5), /duration/);
});

test('the fake engine keeps its follow set and answers followedBy from it', () => {
    const engine = createFakeEngine();
    engine.follow(scope('tab-1'), followed(key('a'), { session: session('s1') }));
    assert.deepEqual(engine.followedBy(harness('claude'), session('s1')), { scope: 'tab-1', key: 'a' });
    engine.unfollow(scope('tab-1'), key('a'));
    assert.equal(engine.followedBy(harness('claude'), session('s1')), null);
});

test('sessionStarted rebinds the followed session to the one it names', () => {
    const engine = createFakeEngine();
    engine.follow(scope('tab-1'), followed(key('a'), { session: session('s1') }));
    engine.sessionStarted(scope('tab-1'), key('a'), { session: session('s2'), cwd: null });
    assert.equal(engine.followedBy(harness('claude'), session('s1')), null);
    assert.deepEqual(engine.followedBy(harness('claude'), session('s2')), { scope: 'tab-1', key: 'a' });
});

test('compacted returns the scripted restore text for a followed key and the empty text otherwise', () => {
    const engine = createFakeEngine({ restore: restore('compacted text') });
    assert.equal(engine.compacted(scope('tab-1'), key('a')), '');
    engine.follow(scope('tab-1'), followed(key('a'), { session: session('s1') }));
    assert.equal(engine.compacted(scope('tab-1'), key('a')), 'compacted text');
    assert.equal(engine.compacted(scope('tab-2'), key('a')), '');
    assert.equal(engine.restoreText(), 'compacted text');
});

test('refresh and curate resolve at once and every call is recorded in order', async () => {
    const engine = createFakeEngine();
    await engine.refresh(scope('tab-1'));
    await engine.curate(scope('tab-1'));
    assert.deepEqual(engine.calls(), ['refresh', 'curate']);
});

test('emit hands the event to the captured events', () => {
    const engine: FakeEngine = createFakeEngine();
    const event = { kind: 'recap-written' as const, scope: scope('tab-1'), turns: 1, boundary: true };
    engine.emit(event);
    assert.deepEqual(engine.emitted(), [event]);
});

test('a scripted writer failure resolves to Unknown and the request is captured', async () => {
    const world = createEngineWorld({ writer: { kind: 'fail', why: { why: 'failed', code: 2, detail: 'scripted' } } });
    const result = await world.plugs.models.writer().write(request());
    assert.deepEqual(result, { kind: 'unknown', why: { why: 'failed', code: 2, detail: 'scripted' } });
    assert.equal(world.requests().length, 1);
});

test('a scripted writer that throws rejects, and one that blocks answers after release', async () => {
    const thrown = createEngineWorld({ writer: { kind: 'throw', message: 'boom' } });
    await assert.rejects(thrown.plugs.models.writer().write(request()), { message: 'boom' });
    const blocked = createEngineWorld({ writer: { kind: 'block', after: { kind: 'answer', value: { kind: 'written', text: 'late', costUsd: 0 } } } });
    const pending = blocked.plugs.models.writer().write(request());
    blocked.release();
    assert.deepEqual(await pending, { kind: 'written', text: 'late', costUsd: 0 });
});

test('the default writer answers with the open facts joined by newlines', async () => {
    const world: EngineWorld = createEngineWorld();
    world.store.seed(null, [
        factOf('f1', { text: 'one' }),
        factOf('f2', { text: 'two', state: 'closed', closedWhy: 'done', closedAt: 3 }),
        factOf('f3', { text: 'three' }),
    ]);
    assert.deepEqual(await world.plugs.models.writer().write(request()), { kind: 'written', text: 'one\nthree', costUsd: 0 });
});

test('failReads makes the next read of that name Unknown, then the store answers again', () => {
    const world = createEngineWorld();
    world.store.failReads('readRecap', 1);
    const first = world.plugs.store.records.readRecap(scope('tab-1'));
    assert.deepEqual(first, { kind: 'unknown', why: { why: 'failed', code: 1, detail: 'scripted readRecap failure' } });
    assert.equal(world.plugs.store.records.readRecap(scope('tab-1')), null);
    assert.deepEqual(world.store.calls(), ['readRecap', 'readRecap']);
});

test('openOf and recentlyClosed read the seeded facts of one task', () => {
    const world = createEngineWorld();
    world.store.seed(null, [
        factOf('f1', { text: 'one' }),
        factOf('f2', { text: 'two', state: 'closed', closedWhy: 'done', closedAt: 3 }),
        factOf('f3', { text: 'three' }),
    ]);
    const open = listed(world.plugs.store.facts.openOf(taskA));
    assert.deepEqual(
        open.map((fact) => fact.id),
        ['f1', 'f3'],
    );
    assert.deepEqual(
        listed(world.plugs.store.facts.recentlyClosed(taskA, 0)).map((fact) => fact.id),
        ['f2'],
    );
    assert.deepEqual(listed(world.plugs.store.facts.recentlyClosed(taskA, 5)), []);
});

test('the memory store records each call name in order', () => {
    const store = createMemoryStore({ recap: null, lastRun: null });
    store.records.beginRun(scope('tab-1'), null, instant(1));
    assert.equal(store.records.lastRunOf(scope('tab-1')), null);
    assert.deepEqual(store.calls(), ['beginRun', 'lastRunOf']);
});

test('the world hands out a manual clock, counter ids, and captures the log and events', () => {
    const world = createEngineWorld();
    world.clock.set(7);
    assert.equal(world.plugs.environment.clock.now(), 7);
    assert.equal(world.plugs.environment.ids.next(), 'id-1');
    assert.equal(world.plugs.environment.ids.next(), 'id-2');
    world.plugs.environment.log('line');
    const event = { kind: 'turn-recorded' as const, scope: scope('tab-1'), key: key('a'), at: instant(7) };
    world.plugs.on?.(event);
    assert.deepEqual(world.lines(), ['line']);
    assert.deepEqual(world.events(), [event]);
});

const isRunId = (text: string): text is RunId => typeof text === 'string';

const runOf = (minted: readonly string[]): RunRef => {
    const id = 'run-1';
    if (!isRunId(id)) {
        throw new Error('a run id is a string');
    }
    let next = 0;
    return {
        id,
        task: taskA,
        at: 9,
        language: 'en',
        mint: () => {
            const made = factOf(minted[next] ?? 'spare').id;
            next += 1;
            return made;
        },
    };
};

const appendFold: Fold = (before, ops, run) => {
    const added = ops.flatMap((op) => (op.op === 'add' ? [factOf(run.mint(), { task: run.task, section: op.section, text: op.text, firstAt: run.at, lastAt: run.at })] : []));
    const refused = ops.flatMap((op) => (op.op === 'add' ? [] : [{ op, reason: 'unknown-id' as const }]));
    return { ledger: [...before, ...added], refused, changed: added };
};

const addOp = (text: string): Operation => ({ op: 'add', section: 'now', text, why: null, ref: null, at: null, agent: null });

test('a memory store with a fold applies operations through it and keeps the folded ledger', () => {
    const store = createMemoryStore({ fold: appendFold });
    const under: StoreUnderTest = store;
    const applied = under.facts.apply(runOf(['f1']), [addOp('first'), { op: 'close', id: 'missing', why: 'done' }]);
    assert.deepEqual(applied.changed.map((fact) => fact.id), ['f1']);
    assert.deepEqual(applied.refused.map((refusal) => refusal.reason), ['unknown-id']);
    assert.deepEqual(listed(under.facts.openOf(taskA)).map((fact) => fact.text), ['first']);
    assert.equal(store.markdown(), 'first');
    assert.deepEqual(store.calls(), ['apply', 'openOf']);
});

test('a memory store without a fold changes nothing on apply', () => {
    const store = createMemoryStore();
    const applied = store.facts.apply(runOf(['f1']), [addOp('first')]);
    assert.deepEqual(applied, { changed: [], refused: [] });
    assert.deepEqual(listed(store.facts.openOf(taskA)), []);
});

const subject: Subject<EngineWorld, FakeEngine> = {
    name: 'fake engine',
    level: 'surface',
    world: () => createEngineWorld(),
    create: () => createFakeEngine(),
};

runConformance({
    test: (name, body) => {
        test(name, body);
    },
    cases: engineCases,
    subject,
    pending: [],
});
