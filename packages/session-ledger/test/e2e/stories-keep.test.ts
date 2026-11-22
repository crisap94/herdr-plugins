import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UNREAD, createEngine, type Chunk, type Fact, type TaskId } from '@stateforge-labs/session-ledger';
import { grewOf } from '@stateforge-labs/session-ledger/unstable/ports/transcripts.ts';
import { textOf } from '@stateforge-labs/session-ledger/unstable/recap/domain/text.ts';
import { brand } from '@stateforge-labs/session-ledger/unstable/recap/domain/brand.ts';
import { createEngineWorld, followed, key, scope, session, type Behaviour, type CuratedAnswer, type WrittenAnswer } from '@stateforge-labs/session-ledger/testkit';

const TAB = scope('one');
const MINUTES = 60_000;

const CURATED: Behaviour<CuratedAnswer> = { kind: 'answer', value: { kind: 'curated', text: '{"story":"kept story"}' } };
const SILENT: Behaviour<CuratedAnswer> = { kind: 'answer', value: { kind: 'curated', text: '{"story":null}' } };
const NO_OPS: Behaviour<WrittenAnswer> = { kind: 'answer', value: { kind: 'written', text: JSON.stringify({ ops: [] }), costUsd: 0 } };

const spoken = (line: string): Behaviour<Chunk> => ({
    kind: 'answer',
    value: { kind: 'chunk', entries: [{ role: 'user', text: textOf(line) }], title: null, lastPrompt: textOf(line), claudeRecap: null, notes: [], position: UNREAD, grew: grewOf(true) },
});

const factOf = (id: string, task: TaskId, text: string, lastAt: number): Fact => ({
    id: brand<string, 'FactId'>(id), task, section: 'now', text, why: null, ref: null, agent: null, anchor: null,
    firstAt: 1, lastAt, state: 'open', closedWhy: null, closedAt: null, language: 'en',
});

test('a curator answer with no story leaves the stored story as it was', async () => {
    const world = createEngineWorld();
    const engine = createEngine(world.plugs);
    const stories = world.plugs.store.stories;
    if (stories === undefined) {
        throw new Error('the world has no stories plug');
    }
    engine.follow(TAB, followed(key('a'), { session: session('s1') }));
    world.setRead(spoken('hello'));
    world.setWriter(NO_OPS);
    engine.turnEnded(TAB, key('a'), 'requested');
    await world.settle();
    const recap = world.store.records.readRecap(TAB);
    if (recap === null || 'kind' in recap) {
        throw new Error('the turn wrote no recap');
    }
    const [only] = recap.tasks;
    if (only === undefined || recap.tasks.length !== 1) {
        throw new Error('the turn did not write one task');
    }
    const task: TaskId = { tab: TAB, key: key(only.id) };
    world.store.seed(null, [factOf('fct_1', task, 'open work', 1), factOf('fct_2', task, 'more work', 10 * MINUTES)]);
    world.setCurator(CURATED);
    await engine.curate(TAB);
    await world.settle();
    const kept = stories.read(task);
    assert.equal(kept?.text, 'kept story');
    world.clock.set(10 * MINUTES);
    world.setCurator(SILENT);
    const asked = world.curated().length;
    await engine.curate(TAB);
    await world.settle();
    assert.equal(world.curated().length, asked + 1);
    assert.deepEqual(stories.read(task), kept);
});
