// Chunking a run's new turns for the enumeration: at most 6 000 characters of markup, between turns, inside a turn only between bursts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Entry } from '#src/ports/transcripts.ts';
import { CHUNK_CHARS, chunksOf, newestOf } from '#src/recap/application/chunking.ts';
import { longTurn, START } from '#test/fakes/long-turn.ts';

const CLOCK = { now: START + 3_600_000, zone: 'UTC' };
const user = (text: string, row: number): Entry => ({ role: 'user', text, at: START + row * 1000 });
const agent = (text: string, row: number): Entry => ({ role: 'agent', text, at: START + row * 1000 });

test('a small turn is one chunk holding every entry; no entries, no chunks', () => {
    const entries = [user('hello', 1), agent('hi', 2)];
    const chunks = chunksOf(entries, CLOCK);
    assert.equal(chunks.length, 1);
    assert.deepEqual(chunks[0]?.entries, entries);
    assert.match(chunks.at(0)?.markup ?? '', /<turn role="user" at="09:00">hello<\/turn>/);
    assert.deepEqual(chunksOf([], CLOCK), []);
});

test('a recorded 300-row turn: chunks of at most 6 000 characters that together hold every row once, in order', () => {
    const rows = longTurn();
    assert.ok(rows.length >= 300, `${rows.length} rows`);
    const chunks = chunksOf(rows, CLOCK);
    assert.ok(chunks.length >= 3, `${chunks.length} chunks`);
    assert.ok(chunks.every((chunk) => chunk.markup.length <= CHUNK_CHARS), chunks.map((chunk) => chunk.markup.length).join(' '));
    assert.deepEqual(chunks.flatMap((chunk) => chunk.entries), rows);
    assert.ok(chunks.every((chunk) => chunk.markup.length > CHUNK_CHARS / 3 || chunk === chunks.at(-1)), 'chunks are filled, not cut short');
});

test('a split falls between turns when it can: a chunk that starts a later prompt of the operator starts at it', () => {
    const entries: Entry[] = [];
    for (let turn = 0; turn < 12; turn += 1) {
        entries.push(user(`prompt ${turn}`, turn * 10), agent('reply '.repeat(100), turn * 10 + 1));
    }
    const chunks = chunksOf(entries, CLOCK, 2_500);
    assert.ok(chunks.length > 2);
    for (const chunk of chunks.slice(1)) {
        assert.equal(chunk.entries[0]?.role, 'user', 'every later chunk starts at a prompt');
    }
});

test('inside one long turn the split falls between bursts of tool calls; reads are counted, never listed; a call is clipped', () => {
    const entries: Entry[] = [user('do it all', 0)];
    for (let call = 0; call < 60; call += 1) {
        entries.push({ role: 'tool', kind: 'read', text: `src/r${call}.ts`, at: START + call }, { role: 'tool', kind: 'shell', text: `echo ${'x'.repeat(900)} ${call}`, at: START + call });
    }
    const chunks = chunksOf(entries, CLOCK, 4_000);
    assert.ok(chunks.length > 5);
    assert.ok(chunks.every((chunk) => chunk.markup.length <= 4_000));
    const first = chunks[0]?.markup ?? '';
    assert.match(first, /<tools reads="\d+">/);
    assert.ok(!first.includes('src/r0.ts'), 'a read is not listed');
    assert.ok(!first.includes('x'.repeat(401)), 'a call is clipped');
    assert.deepEqual(chunks.flatMap((chunk) => chunk.entries), entries);
});

test('the newest pieces that fit: whole pieces, the newest always', () => {
    const rows = longTurn();
    const tail = newestOf(rows, CLOCK, 2_000);
    assert.ok(tail !== null && tail.markup.length <= 2_000);
    assert.deepEqual(tail.entries, rows.slice(rows.length - tail.entries.length));
    assert.match(tail.markup, /Should I also remove the legacy callback API/);
    const huge = newestOf([agent('x'.repeat(5_000), 1)], CLOCK, 10);
    assert.equal(huge?.entries.length, 1, 'the newest piece is kept even when it alone is too big');
    assert.equal(newestOf([], CLOCK, 10), null);
});
