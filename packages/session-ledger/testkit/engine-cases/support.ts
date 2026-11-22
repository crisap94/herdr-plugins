import { UNREAD, type Chunk, type Entry, type Recap, type ScopeId } from '@stateforge-labs/session-ledger';
import type { Behaviour, WrittenAnswer } from '../world.ts';
import type { EngineWorld } from '../world.ts';
import { cursorAt, grew, text as textOf } from '../values.ts';

export const panesOf = (world: EngineWorld, tab: ScopeId): readonly string[] => {
    const recap = world.store.records.readRecap(tab);
    if (recap === null || 'kind' in recap) {
        return [];
    }
    return recap.lanes.map((lane) => lane.pane);
};

export const causeOf = (world: EngineWorld, tab: ScopeId): string | null => {
    const last = world.store.records.lastRunOf(tab);
    if (last === null || 'kind' in last) {
        return null;
    }
    return last.cause;
};

export const spoken = (text: string): Behaviour<Chunk> => ({
    kind: 'answer',
    value: { kind: 'chunk', entries: [{ role: 'user', text: textOf(text) }], title: null, lastPrompt: textOf(text), claudeRecap: null, notes: [], position: UNREAD, grew: grew(true) },
});

export const countOf = (world: EngineWorld, call: string): number => world.store.calls().filter((item) => item === call).length;

export const NO_OPS: Behaviour<WrittenAnswer> = { kind: 'answer', value: { kind: 'written', text: JSON.stringify({ ops: [] }), costUsd: 0 } };

export const cursorsOf = (world: EngineWorld, tab: ScopeId): readonly { readonly pane: string; readonly transcript: string; readonly cursor: number }[] => {
    const recap = world.store.records.readRecap(tab);
    if (recap === null || 'kind' in recap) {
        return [];
    }
    return recap.lanes.map((lane) => ({ pane: lane.pane, transcript: lane.transcript, cursor: lane.cursor }));
};

export const chunkOf = (entries: readonly Entry[]): Behaviour<Chunk> => ({
    kind: 'answer',
    value: { kind: 'chunk', entries, title: null, lastPrompt: null, claudeRecap: null, notes: [], position: UNREAD, grew: grew(true) },
});

export const writtenOps = (ops: readonly object[]): Behaviour<WrittenAnswer> => ({
    kind: 'answer',
    value: { kind: 'written', text: JSON.stringify({ ops }), costUsd: 0 },
});

export const addOf = (section: string, text: string): object => ({ op: 'add', section, text, why: null, ref: null, at: null, agent: null });

export const blockedOps = (ops: readonly object[]): Behaviour<WrittenAnswer> => ({
    kind: 'block',
    after: { kind: 'answer', value: { kind: 'written', text: JSON.stringify({ ops }), costUsd: 0 } },
});

export const recapOf = (world: EngineWorld, tab: ScopeId): Recap | null => {
    const recap = world.store.records.readRecap(tab);
    if (recap === null || 'kind' in recap) {
        return null;
    }
    return recap;
};

export const chunkAt = (cursor: number, over: Partial<Chunk> = {}): Behaviour<Chunk> => ({
    kind: 'answer',
    value: { kind: 'chunk', entries: [{ role: 'user', text: textOf('hello') }], title: null, lastPrompt: null, claudeRecap: null, notes: [], position: { cursor: cursorAt(cursor), tail: null }, grew: grew(true), ...over },
});

export const quietAt = (cursor: number): Behaviour<Chunk> => ({
    kind: 'answer',
    value: { kind: 'chunk', entries: [], title: null, lastPrompt: null, claudeRecap: null, notes: [], position: { cursor: cursorAt(cursor), tail: null }, grew: grew(false) },
});
