import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pidfile } from '#src/adapters/pidfile.ts';
import { bounded } from '#src/daemon/bounded.ts';
import { AsyncQueue } from '#src/recap/application/async-queue.ts';
import { Informer } from '#src/recap/application/informer.ts';
import type { Blindness } from '#src/recap/application/informer.ts';
import { DEFAULT_POLICY } from '#src/recap/domain/policy.ts';
import { instant } from '#src/recap/domain/time.ts';
import type { Frame, FleetSource, SnapshotResult, StreamResult } from '#src/ports/fleet-source.ts';

const pause = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms); });

/** A herdr that answers once and then goes quiet: requests are accepted and never answered (a wedged server, a half-open socket). */
function silentHerdr(): { source: FleetSource; subscribes: () => number } {
    let subscribes = 0;
    let answered = false;
    const source: FleetSource = {
        snapshot: (): Promise<SnapshotResult> => {
            if (answered) {
                return new Promise<SnapshotResult>(() => undefined);
            }
            answered = true;
            return Promise.resolve({ kind: 'snapshot', focusedTab: null, seen: { focusedTab: null, lanes: [], panes: [], columns: [], widths: new Map() } });
        },
        subscribe: (): Promise<StreamResult> => {
            subscribes += 1;
            return Promise.resolve({ kind: 'stream', stream: { frames: (): AsyncIterable<Frame> => new AsyncQueue<Frame>(), close: (): void => undefined } });
        },
    };
    return { source, subscribes: (): number => subscribes };
}

test('watchdog: after N minutes with no frame and no snapshot the tick says so and subscribes afresh', async () => {
    let now = 0;
    const blind: Blindness[] = [];
    const { source, subscribes } = silentHerdr();
    const informer = new Informer(source, { now: (): ReturnType<typeof instant> => instant(now) }, DEFAULT_POLICY, {
        onIntents: (): Promise<void> => Promise.resolve(),
        onBlind: (blindness): void => { blind.push(blindness); }, onUnknownKind: (): void => undefined, onBeat: (): void => undefined,
    }, { retryBaseMs: 10, retryMaxMs: 40, resyncDebounceMs: 5, watchdogMs: 5 * 60_000 });
    try {
        await informer.enterSubscription();
        await pause(20);
        const before = subscribes();
        now = 4 * 60_000;
        informer.tick();
        await pause(20);
        assert.equal(subscribes(), before, 'four quiet minutes are not yet worth a new subscription');
        now = 6 * 60_000;
        informer.tick();
        await pause(20);
        assert.ok(subscribes() > before, 'six quiet minutes are');
        assert.match(blind.at(-1)?.saying ?? '', /no frame and no snapshot from herdr for 6 min/);
        const after = subscribes();
        now = 6 * 60_000 + 60_000;
        informer.tick();
        await pause(20);
        assert.equal(subscribes(), after, 'the clock restarts: it does not fire again a minute later');
    } finally {
        informer.stop();
    }
});

test('watchdog: a frame, or a snapshot, counts as a sign of life', async () => {
    let now = 0;
    const queue = new AsyncQueue<Frame>();
    let subscribes = 0;
    const source: FleetSource = {
        snapshot: (): Promise<SnapshotResult> => Promise.resolve({ kind: 'snapshot', focusedTab: null, seen: { focusedTab: null, lanes: [], panes: [], columns: [], widths: new Map() } }),
        subscribe: (): Promise<StreamResult> => { subscribes += 1; return Promise.resolve({ kind: 'stream', stream: { frames: (): AsyncIterable<Frame> => queue, close: (): void => undefined } }); },
    };
    const informer = new Informer(source, { now: (): ReturnType<typeof instant> => instant(now) }, DEFAULT_POLICY, {
        onIntents: (): Promise<void> => Promise.resolve(),
        onBlind: (): void => undefined, onUnknownKind: (): void => undefined, onBeat: (): void => undefined,
    }, { retryBaseMs: 10, retryMaxMs: 40, resyncDebounceMs: 5, watchdogMs: 5 * 60_000 });
    try {
        await informer.enterSubscription();
        void informer.run();
        const before = subscribes;
        for (let minute = 1; minute <= 12; minute += 1) {
            now = minute * 60_000;
            informer.tick();
            await pause(25);
        }
        assert.ok(subscribes - before <= 1, `ticks that take a snapshot keep the watchdog quiet (resubscribed ${subscribes - before}x: only the 10th-tick safety net)`);
    } finally {
        informer.stop();
    }
});

test('bounded: a task that takes too long is given up on, one that fails still fails, and a quick one is done', async () => {
    assert.equal(await bounded(Promise.resolve(), 1000), 'done');
    assert.equal(await bounded(new Promise<void>(() => undefined), 20), 'timeout');
    await assert.rejects(bounded(Promise.reject(new Error('boom')), 1000), /boom/);
});

test('the daemon beat: beating makes it fresh; no beat for too long while the daemon lives makes it wedged; no beat file at all is not', () => {
    const dir = mkdtempSync(join(tmpdir(), 'recap-beat-'));
    try {
        const pidfile = new Pidfile(dir);
        pidfile.claim(process.pid);
        assert.equal(pidfile.wedged(1000), false, 'an older daemon that never beat is not called stuck');
        pidfile.beat();
        assert.equal(pidfile.wedged(60_000), false);
        const old = new Date(Date.now() - 10 * 60_000);
        utimesSync(join(dir, 'daemon.beat'), old, old);
        assert.equal(pidfile.wedged(180_000), true, 'ten minutes without a beat');
        pidfile.beat();
        assert.equal(pidfile.wedged(180_000), false, 'beating again clears it');
        utimesSync(join(dir, 'daemon.beat'), old, old);
        rmSync(join(dir, 'daemon.pid'));
        writeFileSync(join(dir, 'daemon.pid'), '999999999\n');
        assert.equal(pidfile.wedged(180_000), false, 'a daemon that is not running is not wedged, just gone');
    } finally {
        rmSync(dir, { recursive: true });
    }
});
