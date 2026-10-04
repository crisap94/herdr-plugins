import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadExtensions, notesOf, warningsOf } from '#src/extensions/load.ts';
import { upkeep } from '#src/daemon/upkeep.ts';
import type { Extension, Note, NotesResult, UpkeepResult } from '#src/ports/extension.ts';
import { unknown } from '#src/ports/unknowable.ts';

const note = (label: string): Note => ({ label, at: null, details: [] });

test('with no extension registered the plugin loads none and shows nothing', () => {
    const none = loadExtensions(() => undefined);
    assert.deepEqual(none, []);
    assert.equal(notesOf(none).size, 0);
    assert.deepEqual(warningsOf(none, 'en'), []);
});

test('notes merge per pane in order; an unknown reading and a silent extension add none', () => {
    const extensions: Extension[] = [
        { id: 'a', notes: (): NotesResult => ({ kind: 'notes', byPane: new Map([['p1', [note('one')]]]) }) },
        { id: 'b', notes: (): NotesResult => unknown({ why: 'not-found', what: 'b' }) },
        { id: 'c' },
        { id: 'd', notes: (): NotesResult => ({ kind: 'notes', byPane: new Map([['p1', [note('two')]], ['p2', [note('three')]]]) }) },
    ];
    const merged = notesOf(extensions);
    assert.deepEqual(merged.get('p1')?.map((n) => n.label), ['one', 'two']);
    assert.deepEqual(merged.get('p2')?.map((n) => n.label), ['three']);
});

test('warnings: only the non-null ones', () => {
    assert.deepEqual(warningsOf([{ id: 'a', warning: (): string => 'w' }, { id: 'b', warning: (): null => null }, { id: 'c' }], 'en'), ['w']);
});

test('upkeep logs what was done and what failed, stays quiet when idle, and survives a throw', async () => {
    const lines: string[] = [];
    await upkeep([
        { id: 'idle', upkeep: async (): Promise<UpkeepResult> => ({ kind: 'idle' }) },
        { id: 'acts', upkeep: async (): Promise<UpkeepResult> => ({ kind: 'acted', saying: 'did it' }) },
        { id: 'fails', upkeep: async (): Promise<UpkeepResult> => unknown({ why: 'failed', code: 1, detail: 'no' }) },
        { id: 'boom', upkeep: async (): Promise<UpkeepResult> => { throw new Error('bang'); } },
        { id: 'none' },
    ], (line) => { lines.push(line); });
    assert.deepEqual(lines, ['acts: did it', 'fails upkeep failed: exited 1: no', 'boom upkeep threw: bang']);
});
