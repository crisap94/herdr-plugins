import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    engineCases,
    followed,
    harness,
    key,
    runConformance,
    scope,
    session,
    storeCases,
    type Case,
    type Subject,
    type TestFn,
} from '@stateforge-labs/session-ledger/testkit';

interface Counter {
    readonly serial: number;
}

interface Made {
    readonly world: Counter;
    readonly label: string;
}

interface Registered {
    readonly name: string;
    readonly body: () => Promise<void>;
}

const record = (id: string, level: 'surface' | 'full', run: () => Promise<void>): Case<Counter, Made> => ({
    id,
    group: 'TST',
    title: `the case ${id}`,
    level,
    run: async () => run(),
});

const redCase = (): never => {
    throw new Error('red and not pending');
};

const sampleCases = (): readonly Case<Counter, Made>[] => [
    record('TST-1', 'surface', async () => undefined),
    record('TST-2', 'full', async () => undefined),
    record('TST-3', 'surface', async () => {
        throw new Error('pending and red');
    }),
    record('TST-4', 'surface', async () => undefined),
    record('TST-5', 'surface', async () => redCase()),
];

const countingSubject = (level: 'surface' | 'full', created: Made[] = []): Subject<Counter, Made> => {
    let built = 0;
    return {
        name: 'counting',
        level,
        world: () => {
            built += 1;
            return { serial: built };
        },
        create: (world) => {
            const made = { world, label: `made-${world.serial}` };
            created.push(made);
            return made;
        },
    };
};

const collect = (cases: readonly Case<Counter, Made>[], subject: Subject<Counter, Made>, pending: readonly string[]): readonly Registered[] => {
    const registered: Registered[] = [];
    const fake: TestFn = (name, body) => {
        registered.push({ name, body });
    };
    runConformance({ test: fake, cases, subject, pending });
    return registered;
};

const bodyOf = (registered: readonly Registered[], name: string): (() => Promise<void>) => {
    const found = registered.find((item) => item.name === name);
    assert.ok(found, `no test named ${name}`);
    return found.body;
};

test('the registry exports hold the engine groups not yet written and the REC store cases', () => {
    assert.deepEqual(engineCases, []);
    assert.deepEqual(
        storeCases.map((kase) => kase.id),
        ['REC-1', 'REC-2', 'REC-3', 'REC-4', 'REC-5', 'REC-6', 'REC-7', 'REC-8', 'REC-9', 'REC-10', 'REC-11', 'REC-12', 'REC-13'],
    );
});

test('the identifier constructors return the text they are given and refuse a blank', () => {
    assert.equal(scope('one'), 'one');
    assert.equal(key('a'), 'a');
    assert.equal(session('s1'), 's1');
    assert.equal(harness('claude'), 'claude');
    assert.throws(() => scope(' '));
    assert.throws(() => key(''));
    assert.throws(() => session('\t'));
    assert.throws(() => harness(''));
});

test('followed fills the unset fields and keeps the ones given', () => {
    assert.deepEqual(followed(key('a')), { key: 'a', harness: 'claude', session: null, cwd: null, title: null });
    assert.deepEqual(followed(key('a'), { session: session('s1'), title: 'Work' }), {
        key: 'a',
        harness: 'claude',
        session: 's1',
        cwd: null,
        title: 'Work',
    });
});

test('runConformance registers one test per case and skips full cases on a surface subject', () => {
    const registered = collect(sampleCases(), countingSubject('surface'), ['TST-3']);
    assert.deepEqual(
        registered.map((item) => item.name),
        ['TST-1 the case TST-1', 'TST-3 the case TST-3', 'TST-4 the case TST-4', 'TST-5 the case TST-5'],
    );
});

test('runConformance registers the full cases on a full subject', () => {
    const registered = collect(sampleCases(), countingSubject('full'), []);
    assert.equal(registered.length, 5);
    assert.equal(registered[1]?.name, 'TST-2 the case TST-2');
});

test('each case receives the subject that create made, and a fresh world is built per case', async () => {
    const created: Made[] = [];
    const seen: { readonly world: Counter; readonly made: Made }[] = [];
    const recording: Case<Counter, Made>[] = ['A-1', 'A-2', 'A-3'].map((id) => ({
        id,
        group: 'A',
        title: 'records',
        level: 'full',
        run: async (world, made) => {
            seen.push({ world, made });
        },
    }));
    const registered = collect(recording, countingSubject('full', created), []);
    for (const item of registered) {
        await item.body();
    }
    assert.equal(created.length, 3);
    assert.deepEqual(
        seen.map((entry) => entry.made),
        created,
    );
    assert.deepEqual(
        seen.map((entry) => entry.world.serial),
        [1, 2, 3],
    );
    assert.deepEqual(
        seen.map((entry) => entry.made.world),
        seen.map((entry) => entry.world),
    );
});

test('a pending case that fails passes its test, and a red case that is not pending fails its test', async () => {
    const registered = collect(sampleCases(), countingSubject('surface'), ['TST-3']);
    await bodyOf(registered, 'TST-3 the case TST-3')();
    await assert.rejects(bodyOf(registered, 'TST-5 the case TST-5')(), { message: 'red and not pending' });
});

test('a pending case that passes fails its test with the instruction to shrink the pending list', async () => {
    const registered = collect(sampleCases(), countingSubject('surface'), ['TST-1']);
    await assert.rejects(bodyOf(registered, 'TST-1 the case TST-1')(), { message: 'TST-1 passes: remove it from pending-TST.json' });
});
