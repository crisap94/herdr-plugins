import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldRoll } from '#src/adapters/os/plugin-version.ts';
import { shutDown } from '#src/daemon/shutdown.ts';
import type { ClosedEvery } from '#src/ports/columns.ts';
import { unknown } from '#src/ports/unknowable.ts';
import { causeOf } from './fakes/cause.ts';
import { countOf } from '#src/recap/domain/count.ts';

const pause = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms); });

test('shouldRoll: only a different version, seen twice in a row, replaces a process', () => {
    assert.equal(shouldRoll('1.5.0', '1.5.0', '1.5.0'), false, 'nothing changed');
    assert.equal(shouldRoll('1.5.0', '1.5.1', null), false, 'first look at the new version: wait');
    assert.equal(shouldRoll('1.5.0', '1.5.1', '1.5.0'), false, 'the previous look still saw the old one');
    assert.equal(shouldRoll('1.5.0', '1.5.1', '1.5.1'), true, 'the same new version twice');
    assert.equal(shouldRoll('1.5.0', '1.5.2', '1.5.1'), false, 'still changing: wait');
    assert.equal(shouldRoll(null, '1.5.1', '1.5.1'), false, 'it never knew its own version');
    assert.equal(shouldRoll('1.5.0', null, null), false, 'an unreadable manifest is not a new version');
});

function fakeColumns(closeEvery: () => Promise<ClosedEvery>): { columns: { closeEvery: () => Promise<ClosedEvery> }; order: string[] } {
    const order: string[] = [];
    return { columns: { closeEvery: async (): Promise<ClosedEvery> => { order.push('closing'); const result = await closeEvery(); order.push('closed'); return result; } }, order };
}

test('shutDown: stops folding FIRST, then waits for the whole batch and says how many were closed', async () => {
    const lines: string[] = [];
    const { columns, order } = fakeColumns(async () => { await pause(60); return { kind: 'closed', closed: countOf(27), failed: countOf(0) }; });
    const informer = { stop: (): void => { order.push('informer stopped'); } };
    await shutDown(columns, informer, (line) => { lines.push(line); });
    assert.deepEqual(order, ['informer stopped', 'closing', 'closed'], 'it did not return before the batch finished');
    assert.deepEqual(lines, ['stopping: closing every column', 'stopping: closed 27 columns']);
});

const run = async (closeEvery: () => Promise<ClosedEvery>, ms?: number): Promise<string> => {
    const lines: string[] = [];
    await shutDown(fakeColumns(closeEvery).columns, { stop: (): void => undefined }, (line) => { lines.push(line); }, ms);
    return lines.at(-1) ?? '';
};

test('shutDown: singular, failures, an unreachable herdr and a batch that takes too long are each said — and each returns', async () => {
    assert.equal(await run(() => Promise.resolve({ kind: 'closed', closed: countOf(1), failed: countOf(0) })), 'stopping: closed 1 column');
    assert.equal(await run(() => Promise.resolve({ kind: 'closed', closed: countOf(3), failed: countOf(2) })), 'stopping: closed 3 columns, 2 could not be closed');
    assert.match(await run(() => Promise.resolve(unknown({ why: 'unreachable', detail: causeOf('no socket') }))), /could not close the columns \(unreachable: no socket\)/);
    assert.match(await run(() => new Promise<ClosedEvery>(() => undefined), 30), /took more than 0.03 s; leaving/);
});
