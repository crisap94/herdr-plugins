import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultOn, slot } from '#src/daemon/slots/hooks.ts';
import { parseRoot, parseSwitch, startSlots, type Line, type SlotContext, type SlotEntry, type StatusEvent, type Switch } from '#src/daemon/slots.ts';
import { emptyBoard } from '#src/recap/domain/board.ts';
import { instant } from '#src/recap/domain/time.ts';

const SOCKET = join('hooks', 'hooks.sock');

interface Fake {
    readonly root: string;
    readonly lines: Line[];
    readonly listeners: Set<(event: StatusEvent) => void>;
    readonly context: (setting: Switch) => SlotContext;
}

function fake(): Fake {
    const root = mkdtempSync(join(tmpdir(), 'hooks-slot-'));
    const lines: Line[] = [];
    const listeners = new Set<(event: StatusEvent) => void>();
    const context = (setting: Switch): SlotContext => ({
        root: parseRoot(root),
        clock: { now: () => instant(0) },
        board: () => emptyBoard(),
        observe: (): void => {},
        statuses: (listener: (event: StatusEvent) => void): (() => void) => {
            listeners.add(listener);
            return (): void => { listeners.delete(listener); };
        },
        engine: {},
        recaps: {},
        setting: (): Switch => setting,
        log: (line: Line): void => { lines.push(line); },
    } as unknown as SlotContext);
    return { root, lines, listeners, context };
}

test('with the key unset the hooks slot is off: no socket file and the slot does not start', async () => {
    const double = fake();
    try {
        const entry: SlotEntry = { name: 'hooks', key: 'TAB_RECAP_HOOKS', defaultOn, slot };
        const started = await startSlots([entry], double.context(parseSwitch(undefined)));
        assert.equal(existsSync(join(double.root, SOCKET)), false);
        assert.deepEqual(double.lines, []);
        assert.equal(double.listeners.size, 0);
        await started.stop();
    } finally {
        rmSync(double.root, { recursive: true, force: true });
    }
});

test('with the key on the endpoint listens on a 0600 socket and the status tap is subscribed', async () => {
    const double = fake();
    try {
        const running = await slot.start(double.context('on'));
        const path = join(double.root, SOCKET);
        assert.equal(existsSync(path), true);
        assert.equal(statSync(path).mode & 0o777, 0o600);
        assert.equal(double.listeners.size, 1);
        await running.stop();
        assert.equal(existsSync(path), false);
        assert.equal(double.listeners.size, 0);
    } finally {
        rmSync(double.root, { recursive: true, force: true });
    }
});
