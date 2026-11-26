import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { FULL_WRITER_VIEW, keepNewestOf, nextHoursOf, prunedWriterView } from '@stateforge-labs/session-ledger';
import { judgingWorld, type EvalWorld } from '../support/eval-world.ts';
import { FILE, replayRun } from '../support/replay-world.ts';

const FIRST_WORDS = ['Add a cart to the shop', 'Use SQLite for it, no server', 'also add totals', 'open a merge request', 'can guests keep their basket?', 'cookie is fine'];

describe('the six-turn transcript replays on the engine', () => {
    test('with --merge-turns 1 or none, one writer call per turn, each carrying its own turn', async () => {
        for (const mergeTurns of [undefined, 1]) {
            const replayed = await replayRun('one', FULL_WRITER_VIEW, mergeTurns);
            assert.equal(replayed.done.turns, 6);
            assert.equal(replayed.done.windows, 6);
            assert.equal(replayed.done.facts.length, 6);
            assert.equal(replayed.done.costUsd, 1.5);
            assert.deepEqual(replayed.seen.map((request) => request.input.transcripts[0]?.entries[0]?.text), FIRST_WORDS);
            assert.deepEqual(replayed.seen.map((request) => request.input.transcripts.length), [1, 1, 1, 1, 1, 1]);
        }
    });

    test('with --merge-turns 2, adjacent turns share one writer call', async () => {
        const merged = await replayRun('one', FULL_WRITER_VIEW, 2);
        assert.equal(merged.done.turns, 6);
        assert.equal(merged.done.windows, 3);
        assert.equal(merged.done.facts.length, 3);
        assert.equal(merged.done.costUsd, 0.75);
        assert.deepEqual(merged.seen.map((request) => request.input.transcripts[0]?.entries.length), [4, 4, 4]);
        assert.deepEqual(merged.seen.map((request) => request.input.transcripts[0]?.entries[0]?.text), [FIRST_WORDS[0], FIRST_WORDS[2], FIRST_WORDS[4]]);
    });

    test('on the single-call pipeline, named or by default, the enumeration is never asked', async () => {
        for (const pipeline of ['one', undefined] as const) {
            const { done, seen, documents } = await replayRun(pipeline, FULL_WRITER_VIEW);
            assert.equal(documents.length, 0, pipeline ?? 'the default is the single call');
            assert.equal(seen.length, 6);
            assert.ok(seen.every((request) => request.input.candidates === undefined));
            assert.equal(done.costUsd, 1.5);
        }
    });

    test('on the full pipeline every turn is enumerated first and the cost adds both calls', async () => {
        const { done, seen, documents } = await replayRun('full', FULL_WRITER_VIEW);
        assert.equal(documents.length, 6);
        assert.equal(seen.length, 6);
        assert.ok(Math.abs(done.costUsd - (6 * 0.25 + 6 * 0.01)) < 1e-9, `${done.costUsd}`);
    });

    test('a pruned view hides the older facts from the writer, counts them, and leaves the ledger whole', async () => {
        const { done, seen } = await replayRun('one', prunedWriterView(keepNewestOf(2), nextHoursOf(24)));
        assert.equal(done.facts.length, 6);
        const hidden = seen.flatMap((request) => request.input.ledgers[0]?.hidden?.get('done') ?? []);
        assert.ok(hidden.length > 0);
        assert.equal(hidden.at(-1), 3);
        assert.equal(seen.at(-1)?.input.ledgers[0]?.facts.length, 2);
    });
});

describe('eval --replay takes its pipeline and window from the command line', () => {
    let world: EvalWorld;

    const answering = (): void => {
        world.forget();
        for (let call = 1; call <= 6; call += 1) {
            world.answer(`writer.${call}`, JSON.stringify({ ops: [{ op: 'add', anchor: FIRST_WORDS[call - 1], section: 'done', text: ['Wrote the cart model', 'Chose SQLite for carts', 'Added totals', 'Opened merge request 34', 'Asked about guest baskets', 'Settled on a cookie'][call - 1] }] }));
        }
    };

    before(() => {
        world = judgingWorld();
    });

    after(() => {
        world.close();
    });

    test('each of the four pipelines is accepted and named in the report', { timeout: 60_000 }, async () => {
        for (const name of ['one', 'enumerate', 'enumerate+gates', 'full']) {
            answering();
            const ran = await world.run(['eval', '--replay', FILE, '--pipeline', name]);
            assert.equal(ran.code, 0, `${name}: ${ran.stderr}`);
            assert.match(ran.stdout, new RegExp(`^view full · pipeline ${name.replace('+', '\\+')} · merge-turns 1 ·`));
            assert.match(ran.stdout, /6 turns: 6 facts/);
        }
    });

    test('a pipeline that does not exist exits 2 and lists the four', { timeout: 30_000 }, async () => {
        const ran = await world.run(['eval', '--replay', FILE, '--pipeline', 'fast']);
        assert.equal(ran.code, 2);
        assert.match(ran.stderr, /--pipeline takes one, enumerate, enumerate\+gates, full/);
    });

    test('--pipeline and --merge-turns without --replay exit 2', { timeout: 30_000 }, async () => {
        for (const flags of [['--pipeline', 'one'], ['--merge-turns', '2'], ['--prune']]) {
            const ran = await world.run(['eval', ...flags]);
            assert.equal(ran.code, 2, flags.join(' '));
            assert.match(ran.stderr, /go with --replay/);
        }
    });

    test('--merge-turns takes a whole number above 0', { timeout: 30_000 }, async () => {
        for (const value of ['0', '1.2', 'no']) {
            const ran = await world.run(['eval', '--replay', FILE, '--merge-turns', value]);
            assert.equal(ran.code, 2, value);
            assert.match(ran.stderr, /--merge-turns takes a whole number above 0/);
        }
    });

    test('--merge-turns 2 turns six turns into three writer calls and says so', { timeout: 30_000 }, async () => {
        answering();
        const ran = await world.run(['eval', '--replay', FILE, '--pipeline', 'one', '--merge-turns', '2']);
        assert.equal(ran.code, 0, ran.stderr);
        assert.match(ran.stdout, /^view full · pipeline one · merge-turns 2 ·/);
        assert.match(ran.stdout, /calls: 3 writer \+ 0 enumeration \(0\.50 per turn\)/);
        assert.match(ran.stdout, /6 turns: 3 facts/);
    });
});
