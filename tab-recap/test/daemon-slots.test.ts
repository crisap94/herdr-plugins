import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SLOT_TABLE } from '../src/daemon/slot-table.ts';
import { parseSwitch, startSlots, taps, type Line, type Mode, type Running, type SlotContext, type SlotEntry, type SlotKey, type SlotName, type Switch } from '../src/daemon/slots.ts';
import * as hooks from '../src/daemon/slots/hooks.ts';
import * as view from '../src/daemon/slots/view.ts';
import * as roll from '../src/daemon/slots/roll.ts';
import * as timing from '../src/daemon/slots/timing.ts';

const SLOT_MODULES = [
    { name: 'hooks', file: 'hooks', mod: hooks },
    { name: 'view', file: 'view', mod: view },
    { name: 'roll', file: 'roll', mod: roll },
    { name: 'timing', file: 'timing', mod: timing },
] as const;

interface FactStore {
    readonly starts: string[];
    readonly stops: string[];
    readonly logs: string[];
}

const ledger = (): FactStore => ({ starts: [], stops: [], logs: [] });

const contextWith = (values: Partial<Record<SlotKey, string>>, book: FactStore): SlotContext => ({
    setting: (key: SlotKey): Switch => parseSwitch(values[key]),
    log: (line: Line): void => { book.logs.push(line); },
} as SlotContext);

const fakeEntry = (name: SlotName, key: SlotKey, defaultOn: Mode, book: FactStore, broken = false): SlotEntry => ({
    name,
    key,
    defaultOn,
    slot: {
        start: (): Running => {
            if (broken) {
                throw new Error(`${name} broke`);
            }
            book.starts.push(name);
            return { stop: (): void => { book.stops.push(name); } };
        },
    },
});

test('slot keys are unique and every key starts with TAB_RECAP_', () => {
    const keys = SLOT_TABLE.map((entry) => entry.key);
    assert.equal(new Set(keys).size, keys.length);
    for (const key of keys) {
        assert.ok(key.startsWith('TAB_RECAP_'), key);
    }
});

test('each table entry takes its defaultOn and slot from its slot file', () => {
    assert.equal(SLOT_TABLE.length, SLOT_MODULES.length);
    for (const entry of SLOT_TABLE) {
        const found = SLOT_MODULES.find((candidate) => candidate.name === entry.name);
        assert.ok(found, entry.name);
        assert.equal(entry.defaultOn, found.mod.defaultOn);
        assert.equal(entry.slot, found.mod.slot);
    }
});

test('slot files have no static import other than import type', () => {
    for (const { file } of SLOT_MODULES) {
        const text = readFileSync(new URL(`../src/daemon/slots/${file}.ts`, import.meta.url), 'utf8');
        const imports = text.split('\n').filter((line) => /^\s*import\b/.test(line));
        for (const line of imports) {
            assert.match(line, /^import type /);
        }
    }
});

test('a slot starts when its key is on, or when the key is unset and its default is on', async () => {
    for (const value of [undefined, 'on', 'off'] as const) {
        for (const defaultOn of ['on', 'off'] as const) {
            const book = ledger();
            const values: Partial<Record<SlotKey, string>> = value === undefined ? {} : { TAB_RECAP_HOOKS: value };
            await startSlots([fakeEntry('hooks', 'TAB_RECAP_HOOKS', defaultOn, book)], contextWith(values, book));
            const expected = value === 'on' || (value === undefined && defaultOn === 'on');
            assert.equal(book.starts.length, expected ? 1 : 0, `value ${String(value)} default ${defaultOn}`);
        }
    }
});

test('with the hooks, self-roll, view and timing keys off and the others unset the real table starts nothing and logs no slot line', async () => {
    const book = ledger();
    await startSlots(SLOT_TABLE, contextWith({ TAB_RECAP_HOOKS: 'off', TAB_RECAP_SELF_ROLL: 'off', TAB_RECAP_VIEW_SERVER: 'off', TAB_RECAP_TIMING_EVENTS: 'off' }, book));
    assert.deepEqual(book.logs, []);
    assert.deepEqual(book.starts, []);
});

test('a slot whose start throws does not stop the others', async () => {
    const book = ledger();
    const table = [fakeEntry('hooks', 'TAB_RECAP_HOOKS', 'on', book, true), fakeEntry('view', 'TAB_RECAP_VIEW_SERVER', 'on', book)];
    await startSlots(table, contextWith({}, book));
    assert.deepEqual(book.starts, ['view']);
    assert.ok(book.logs.some((line) => line.startsWith('slot hooks did not start')));
});

test('stop calls every started slot once and no slot that was not started', async () => {
    const book = ledger();
    const table = [fakeEntry('hooks', 'TAB_RECAP_HOOKS', 'on', book), fakeEntry('view', 'TAB_RECAP_VIEW_SERVER', 'off', book), fakeEntry('roll', 'TAB_RECAP_SELF_ROLL', 'on', book)];
    const slots = await startSlots(table, contextWith({}, book));
    await slots.stop();
    assert.deepEqual(book.stops.toSorted(), ['hooks', 'roll']);
});

test('taps run listeners in order, survive a throwing listener, and remove a listener', () => {
    const book = ledger();
    const tapped = taps<number>((line) => { book.logs.push(line); });
    const seen: number[] = [];
    const removeFirst = tapped.tap((n) => { seen.push(n); });
    tapped.tap((n) => {
        if (n === 1) {
            throw new Error('boom');
        }
        seen.push(n * 10);
    });
    tapped.tap((n) => { seen.push(n * 100); });
    tapped.emit(1);
    removeFirst();
    tapped.emit(2);
    assert.deepEqual(seen, [1, 100, 20, 200]);
    assert.equal(book.logs.length, 1);
    assert.match(book.logs[0] ?? '', /boom/);
});
