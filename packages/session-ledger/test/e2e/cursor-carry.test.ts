import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseSessionId, type SessionId } from '@stateforge-labs/session-ledger';
import { CursorCarry } from '@stateforge-labs/session-ledger/unstable/recap/application/cursor-carry.ts';
import type { LaneCursor } from '@stateforge-labs/session-ledger/unstable/ports/recap-records.ts';
import { UNREAD, type Located, type Position, type Transcripts } from '@stateforge-labs/session-ledger/unstable/ports/transcripts.ts';

const sessionOf = (id: string): SessionId => {
    const read = parseSessionId(id);
    if (read.kind !== 'ok') throw new Error(`not a session id: ${id}`);
    return read.value;
};

const cursorOf = (transcript: string, cursor = 0, agent = 'claude'): LaneCursor => ({ pane: 'p1', agent, transcript, cursor, tail: null, title: null, lastPrompt: null, claudeRecap: null });

const readerOf = (asked: string[], same: boolean): Transcripts => ({
    agent: 'claude',
    inFlight: { kind: 'unsupported', why: 'in-flight-unavailable' },
    locate: () => Promise.resolve({ kind: 'unknown', why: { why: 'not-found', what: 'unused' } }),
    read: () => Promise.resolve({ kind: 'unknown', why: { why: 'not-found', what: 'unused' } }),
    latestPrompt: () => Promise.resolve({ kind: 'prompt', text: null }),
    carry: (from: Located, to: Located, at: Position) => {
        asked.push(`${from.kind === 'located' ? from.source : '?'}>${to.kind === 'located' ? to.source : '?'}`);
        return Promise.resolve(same ? at : UNREAD);
    },
});

const S1 = sessionOf('s1');

test('a new source the reader confirms as the same file continues the old cursor', async () => {
    const carry = new CursorCarry();
    const asked: string[] = [];
    const reader = readerOf(asked, true);
    await carry.cursorFor({ session: S1, cursors: [], wanted: cursorOf('x1'), reader });
    const was = await carry.cursorFor({ session: S1, cursors: [cursorOf('x1', 7)], wanted: cursorOf('x2'), reader });
    assert.equal(was.cursor, 7);
    assert.equal(was.transcript, 'x2');
    assert.deepEqual(asked, ['x1>x2']);
});

test('a new source the reader does not confirm starts at UNREAD', async () => {
    const carry = new CursorCarry();
    const reader = readerOf([], false);
    await carry.cursorFor({ session: S1, cursors: [], wanted: cursorOf('x1'), reader });
    assert.deepEqual(await carry.cursorFor({ session: S1, cursors: [cursorOf('x1', 7)], wanted: cursorOf('x2'), reader }), cursorOf('x2'));
});

test('a null session or a changed agent never asks the reader', async () => {
    const carry = new CursorCarry();
    const asked: string[] = [];
    const reader = readerOf(asked, true);
    await carry.cursorFor({ session: null, cursors: [], wanted: cursorOf('x1'), reader });
    assert.deepEqual(await carry.cursorFor({ session: null, cursors: [cursorOf('x1', 7)], wanted: cursorOf('x2'), reader }), cursorOf('x2'));
    await carry.cursorFor({ session: S1, cursors: [], wanted: cursorOf('y1'), reader });
    assert.deepEqual(await carry.cursorFor({ session: S1, cursors: [cursorOf('y1', 7)], wanted: cursorOf('y2', 0, 'codex'), reader }), cursorOf('y2', 0, 'codex'));
    assert.deepEqual(asked, []);
});

test('a source with its own stored cursor reads from that cursor', async () => {
    const carry = new CursorCarry();
    const reader = readerOf([], true);
    assert.equal((await carry.cursorFor({ session: S1, cursors: [cursorOf('x1', 3)], wanted: cursorOf('x1'), reader })).cursor, 3);
});
