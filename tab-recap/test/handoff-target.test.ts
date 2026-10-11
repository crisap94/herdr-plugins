import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTarget } from '#src/recap/application/handoff-target.ts';
import type { TargetDeps } from '#src/recap/application/handoff-target.ts';
import { handoffPlans } from '#src/adapters/handoff-plan-registry.ts';
import type { InFlight, InFlightReading } from '#src/ports/in-flight.ts';
import type { Waiting } from '#src/recap/application/autocompact.ts';
import { unknown } from '#src/ports/unknowable.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import type { Lane, SeenLane } from '#src/recap/domain/lane.ts';
import { paneId } from '#src/recap/domain/ids.ts';

const SOURCE = paneId('w1:p9');
const TARGET = paneId('w1:p1');
const clear: Waiting = { kind: 'clear' };

const seen = (pane: string, agent: string, over: Partial<SeenLane> = {}): Lane => laneFrom({ paneId: pane, tabId: 'w1:t1', workspaceId: 'w1', agent, status: 'idle', ...over });

function probeOf(reading: InFlightReading): { readonly port: InFlight; readonly reads: () => number } {
    let reads = 0;
    return { port: { read: () => { reads += 1; return Promise.resolve(reading); } }, reads: () => reads };
}

function depsOf(lanes: readonly Lane[], reading: InFlightReading, awaiting: Waiting = clear): TargetDeps & { readonly reads: () => number } {
    const probe = probeOf(reading);
    return { lanes, plans: handoffPlans, inFlight: probe.port, awaiting: () => Promise.resolve(awaiting), reads: probe.reads };
}

const notStarted: InFlightReading = { kind: 'not-started', why: 'the transcript of sess-new not found' };
const freshClaude = seen('w1:p1', 'claude', { session: 'sess-new', cwd: '/repo' });

test('a fresh lane whose session is known and whose transcript does not exist yet is ready', async () => {
    const deps = depsOf([freshClaude], notStarted);
    const result = await resolveTarget(SOURCE, TARGET, deps);
    assert.ok(result.kind === 'ready');
    assert.equal(result.ownTranscript, true);
    assert.equal(deps.reads(), 1);
});

test('a done lane is ready exactly as an idle one is', async () => {
    const result = await resolveTarget(SOURCE, TARGET, depsOf([seen('w1:p1', 'claude', { status: 'done', session: 'sess-1' })], { kind: 'count', count: 0, background: [] }));
    assert.ok(result.kind === 'ready');
});

test('a working or blocked lane is status-not-ready and starts no transcript read', async () => {
    for (const status of ['working', 'blocked', 'weird']) {
        const deps = depsOf([seen('w1:p1', 'claude', { status, session: 'sess-1' })], notStarted);
        assert.deepEqual(await resolveTarget(SOURCE, TARGET, deps), { kind: 'refused', reason: 'status-not-ready' }, status);
        assert.equal(deps.reads(), 0);
    }
});

test('a live awaiting token is in-flight and starts no transcript read', async () => {
    const deps = depsOf([freshClaude], notStarted, { kind: 'waiting', value: 'approval' });
    assert.deepEqual(await resolveTarget(SOURCE, TARGET, deps), { kind: 'refused', reason: 'in-flight' });
    assert.equal(deps.reads(), 0);
});

test('an awaiting token that cannot be read is in-flight', async () => {
    const deps = depsOf([freshClaude], notStarted, unknown({ why: 'unreadable', detail: 'tokens' }));
    assert.deepEqual(await resolveTarget(SOURCE, TARGET, deps), { kind: 'refused', reason: 'in-flight' });
});

test('a transcript that exists but cannot be read is in-flight and sends nothing', async () => {
    const deps = depsOf([seen('w1:p1', 'claude', { session: 'sess-1' })], { kind: 'unknown', why: 'unreadable transcript' });
    assert.deepEqual(await resolveTarget(SOURCE, TARGET, deps), { kind: 'refused', reason: 'in-flight' });
});

test('running work in the target transcript is in-flight', async () => {
    const deps = depsOf([seen('w1:p1', 'claude', { session: 'sess-1' })], { kind: 'count', count: 2, background: [] });
    assert.deepEqual(await resolveTarget(SOURCE, TARGET, deps), { kind: 'refused', reason: 'in-flight' });
});

test('two Codex lanes sharing a directory do not read each other as the target transcript', async () => {
    const lanes = [seen('w1:p9', 'codex', { cwd: '/repo' }), seen('w1:p1', 'codex', { cwd: '/repo' })];
    const deps = depsOf(lanes, { kind: 'count', count: 5, background: [] });
    const result = await resolveTarget(SOURCE, TARGET, deps);
    assert.ok(result.kind === 'ready');
    assert.equal(result.ownTranscript, false);
    assert.equal(deps.reads(), 0);
});

test('two Claude lanes in one directory keep their own transcripts, which the directory does not share', async () => {
    const lanes = [seen('w1:p9', 'claude', { session: 'sess-1', cwd: '/repo' }), seen('w1:p1', 'claude', { session: 'sess-2', cwd: '/repo' })];
    const deps = depsOf(lanes, notStarted);
    const result = await resolveTarget(SOURCE, TARGET, deps);
    assert.ok(result.kind === 'ready');
    assert.equal(result.ownTranscript, true);
    assert.equal(deps.reads(), 1);
});

test('a target whose session identifier is not known yet is ready on status and awaiting only', async () => {
    const deps = depsOf([seen('w1:p1', 'claude', { cwd: '/repo' })], { kind: 'unknown', why: 'no session yet' });
    const result = await resolveTarget(SOURCE, TARGET, deps);
    assert.ok(result.kind === 'ready');
    assert.equal(result.ownTranscript, false);
    assert.equal(deps.reads(), 0);
});

test('a Codex target whose working directory is not known is ready on status and awaiting only', async () => {
    const deps = depsOf([seen('w1:p1', 'codex')], { kind: 'unknown', why: 'no directory' });
    const result = await resolveTarget(SOURCE, TARGET, deps);
    assert.ok(result.kind === 'ready');
    assert.equal(result.ownTranscript, false);
    assert.equal(deps.reads(), 0);
});

test('a pane the daemon has not discovered is not-a-lane and starts no read', async () => {
    const deps = depsOf([seen('w1:p2', 'claude', { session: 'sess-1' })], notStarted);
    assert.deepEqual(await resolveTarget(SOURCE, TARGET, deps), { kind: 'refused', reason: 'not-a-lane' });
    assert.equal(deps.reads(), 0);
});

test('the same pane as source and target is refused before any lane is resolved', async () => {
    const deps = depsOf([freshClaude], notStarted);
    assert.deepEqual(await resolveTarget(TARGET, TARGET, deps), { kind: 'refused', reason: 'source-equals-target' });
    assert.equal(deps.reads(), 0);
});

test('a lane whose kind has no handoff plan is unsupported no-plan and sends nothing', async () => {
    for (const agent of ['hermes', 'gemini']) {
        const deps = depsOf([seen('w1:p1', agent, { session: 'sess-1' })], notStarted);
        assert.deepEqual(await resolveTarget(SOURCE, TARGET, deps), { kind: 'unsupported', reason: 'no-plan' }, agent);
        assert.equal(deps.reads(), 0);
    }
});
