import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ClaudeTranscripts } from '#src/adapters/transcripts/claude/transcripts.ts';
import { tabIdOf } from '#src/recap/domain/ids.ts';
import { fsPathOf } from '#test/fakes/transcript-lines.ts';
import { storeRead } from '#test/db/support.ts';
import { registryOf, sourceWorld, type SourceWorld } from '../support/source-world.ts';

const FIXTURES = join(import.meta.dirname, '..', '..', 'fixtures');
const fixture = (name: string): readonly string[] => readFileSync(join(FIXTURES, name), 'utf8').split('\n').filter((line) => line !== '');

const followed = (world: SourceWorld): { readonly engine: ReturnType<SourceWorld['engineOver']>; readonly at: (session: string) => ReturnType<SourceWorld['seat']> } => ({
    engine: world.engineOver(registryOf([new ClaudeTranscripts(fsPathOf(join(world.dir, 'claude')))])),
    at: (session) => world.seat('claude', { session }),
});

const breaksOf = (world: SourceWorld): readonly (readonly [string, string | null])[] => world.store.boundaries.breaksOf(tabIdOf(String(world.scope))).map((each) => [each.kind, each.trigger]);

test('the first session of a lane is read and stores no boundary', async () => {
    const world = sourceWorld();
    try {
        world.claudeFile('s1', 'claude-session.jsonl');
        const { engine, at } = followed(world);
        await engine.refresh(world.scope, [at('s1')]);
        assert.deepEqual(breaksOf(world), []);
        assert.equal(world.requests.length, 1);
    } finally {
        world.dispose();
    }
});

test('a lane that starts a new session stores one switched boundary', async () => {
    const world = sourceWorld();
    try {
        world.claudeFile('s1', 'claude-session.jsonl');
        world.claudeFile('s2', 'claude-more.jsonl');
        const { engine, at } = followed(world);
        await engine.refresh(world.scope, [at('s1')]);
        world.clock.now = 5000;
        await engine.refresh(world.scope, [at('s2')]);
        assert.deepEqual(breaksOf(world), [['switched', null]]);
        assert.equal(world.store.boundaries.chapterCount(tabIdOf(String(world.scope))), 2);
        assert.equal(world.store.boundaries.lastBreakAt(tabIdOf(String(world.scope)), at('s2').key), 5000);
    } finally {
        world.dispose();
    }
});

test('the recap starts a plain session: the new session is read from its first line and the old cursor is not reused', async () => {
    const world = sourceWorld();
    try {
        world.claudeFile('s1', 'claude-session.jsonl');
        const second = world.claudeFile('s2', 'claude-more.jsonl');
        const { engine, at } = followed(world);
        await engine.refresh(world.scope, [at('s1')]);
        await engine.refresh(world.scope, [at('s2')]);
        assert.deepEqual(world.requests[1]?.input.transcripts[0]?.entries.map((entry) => entry.text), ['and the lexer?', 'The lexer is fine.']);
        const lane = storeRead(world.store.records.readRecap(world.scope))?.sessions[0];
        assert.deepEqual([lane?.transcript.endsWith('s2.jsonl'), lane?.cursor], [true, statSync(second).size]);
    } finally {
        world.dispose();
    }
});

test('the same session read again stores no further boundary', async () => {
    const world = sourceWorld();
    try {
        world.claudeFile('s1', 'claude-session.jsonl');
        const second = world.claudeFile('s2', 'claude-more.jsonl');
        const { engine, at } = followed(world);
        await engine.refresh(world.scope, [at('s1')]);
        await engine.refresh(world.scope, [at('s2')]);
        appendFileSync(second, `${JSON.stringify({ type: 'user', message: { content: 'one more' } })}\n`);
        await engine.refresh(world.scope, [at('s2')]);
        assert.deepEqual(breaksOf(world), [['switched', null]]);
        assert.equal(world.requests.length, 3);
    } finally {
        world.dispose();
    }
});

test('a plain session with no herdr follows its turns and stores the compaction it meets as a compacted boundary with its trigger', async () => {
    const world = sourceWorld();
    try {
        const file = world.claudeFile('s1', 'claude-more.jsonl');
        const turns = fixture('replay-claude.jsonl');
        const { engine, at } = followed(world);
        world.clock.now = 10;
        appendFileSync(file, `${turns.slice(0, 2).join('\n')}\n`);
        await engine.refresh(world.scope, [at('s1')]);
        appendFileSync(file, `${[...turns.slice(2, 4), ...fixture('claude-compact-boundary.jsonl')].join('\n')}\n`);
        world.clock.now = Date.parse('2026-10-07T16:40:00.000Z');
        await engine.compacted(world.scope, [at('s1')]);
        assert.deepEqual(world.store.boundaries.breaksOf(tabIdOf(String(world.scope))).map((each) => [each.kind, each.at, each.trigger]), [['compacted', Date.parse('2026-10-07T16:38:09.490Z'), 'manual']]);
    } finally {
        world.dispose();
    }
});
