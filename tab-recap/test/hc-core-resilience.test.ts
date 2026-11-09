import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { duration } from '#src/adapters/herdr-core/sdk-core.ts';
import { HcCoreFleet } from '#src/adapters/herdr-core/fleet.ts';
import { CoreLink } from '#src/adapters/herdr-core/sdk-core.ts';
import { PathHarnesses } from '#src/adapters/path-harnesses.ts';
import type { CoreEventsTiming } from '#src/adapters/herdr-core/sdk-core.ts';
import type { CoreLinkTiming } from '#src/adapters/herdr-core/sdk-core.ts';
import type { Frame } from '#src/ports/fleet-source.ts';
import { FakeHcCore, frame, later } from '@stateforge-labs/herdr-sdk/core/test-kit';

const LINK: CoreLinkTiming = { helloTimeout: duration(300), backoffBase: duration(40), backoffCap: duration(160) };
const EVENTS: CoreEventsTiming = { backoffBase: duration(30), backoffCap: duration(120), silence: duration(5000) };
const noSession = (): null => null;
const CHILD = join(import.meta.dirname, 'fakes/hc-core-keepalive-child.ts');
const status = (state: string): Record<string, unknown> => ({ records: {}, reported: true, status: { app: 'claude-code', state } });

async function until(ready: () => boolean, tries = 150): Promise<void> {
    for (let spent = 0; spent < tries && !ready(); spent += 1) {
        await later(20);
    }
    assert.ok(ready(), 'waited for the condition');
}

function framesOf(stream: AsyncIterable<Frame>): Frame[] {
    const seen: Frame[] = [];
    void (async (): Promise<void> => { for await (const next of stream) { seen.push(next); } })();
    return seen;
}

function lineCounter(child: ChildProcess): () => number {
    let lines = 0;
    child.stdout?.on('data', (chunk: Buffer) => { lines += chunk.toString('utf8').split('\n').length - 1; });
    return (): number => lines;
}

test('a daemon-like process stays alive while its core is away and reconnects, and ends cleanly once the stream is closed', { timeout: 20000 }, async () => {
    const core = await FakeHcCore.start();
    const child = spawn(process.execPath, [CHILD, core.path], { stdio: ['ignore', 'pipe', 'inherit'] });
    const exited = new Promise<number | null>((resolve) => { child.once('exit', (code) => { resolve(code); }); });
    const lines = lineCounter(child);
    try {
        await until(() => lines() === 1);
        await core.down();
        await later(900);
        assert.equal(child.exitCode, null, 'the process outlives the closed socket');
        await core.up();
        await until(() => lines() === 2);
        child.kill('SIGTERM');
        assert.equal(await exited, 0);
    } finally {
        child.kill('SIGKILL');
        await core.stop();
    }
});

test('a core that accepts, says hello and drops every connection is retried slower each time', async () => {
    const core = await FakeHcCore.start();
    const hello = Reflect.get(frame('hello'), 'result');
    core.on('hello', () => { setTimeout(() => { core.dropAll(); }, 5); return hello; });
    const link = new CoreLink({ path: core.path, timing: LINK });
    try {
        await link.open();
        await later(700);
        assert.ok(core.connections >= 3, `${core.connections} connections`);
        assert.ok(core.connections <= 8, `${core.connections} connections in 700 ms`);
    } finally {
        await link.close();
        await core.stop();
    }
});

test('a second subscribe leaves the first stream running; each stream seeds silently and closing one keeps the other', async () => {
    const core = await FakeHcCore.start();
    const fleet = new HcCoreFleet({ harnesses: new PathHarnesses(['claude']), sessions: noSession, path: core.path, linkTiming: LINK, eventsTiming: EVENTS });
    try {
        const first = await fleet.subscribe();
        assert.ok(first.kind === 'stream');
        const firstFrames = framesOf(first.stream.frames());
        await until(() => core.subscribed === 1);
        const second = await fleet.subscribe();
        assert.ok(second.kind === 'stream');
        const secondFrames = framesOf(second.stream.frames());
        await until(() => core.subscribed === 2);
        await later(100);
        assert.equal(firstFrames.length, 0);
        assert.equal(secondFrames.length, 0);
        core.event('status', 't1', status('idle'));
        await until(() => firstFrames.length === 1 && secondFrames.length === 1);
        assert.deepEqual(firstFrames, secondFrames);
        first.stream.close();
        await until(() => core.subscribed === 1);
        core.event('status', 't2', status('working'));
        await until(() => secondFrames.length === 2);
        assert.equal(firstFrames.length, 1);
        assert.deepEqual(await fleet.shutdown(), { kind: 'done' });
        await until(() => core.open === 0);
    } finally {
        await fleet.shutdown();
        await core.stop();
    }
});
