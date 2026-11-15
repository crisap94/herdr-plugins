import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tabId } from '#src/recap/domain/ids.ts';
import { apiProblems } from '#test/gui-schema-support.ts';
import { call, json, startRig, type Rig } from '#test/desktop-api-support.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const epochOf = (rig: Rig): number => JSON.parse(readFileSync(join(rig.dir, 'api.json'), 'utf8')).startedAt;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

test('events answer at once when something newer than since exists', async () => {
    const rig = await startRig();
    try {
        rig.bus.publish('tab', tabId('t1'));
        rig.bus.publish('index', null);
        const reply = await call(rig, 'GET', '/v1/events?since=1&wait=5');
        assert.deepEqual(apiProblems(json(reply), 'events'), []);
        const body = JSON.parse(reply.text);
        assert.equal(body.seq, 2);
        assert.equal(body.reset, false);
        assert.deepEqual(body.events.map((event: { seq: number; topic: string; tab: string | null }) => [event.seq, event.topic, event.tab]), [[2, 'index', null]]);
    } finally { rig.api.close(); }
});

test('a held poll wakes on a publish', async () => {
    const rig = await startRig();
    try {
        const held = call(rig, 'GET', '/v1/events?since=0&wait=20');
        await sleep(100);
        rig.bus.publish('tab', tabId('t9'));
        const body = JSON.parse((await held).text);
        assert.deepEqual(body.events.map((event: { tab: string }) => event.tab), ['t9']);
        assert.equal(body.reset, false);
    } finally { rig.api.close(); }
});

test('a poll with nothing new times out with an empty list and the current seq', async () => {
    const rig = await startRig();
    try {
        rig.bus.publish('tab', tabId('t1'));
        const started = Date.now();
        const reply = await call(rig, 'GET', '/v1/events?since=1&wait=1');
        assert.ok(Date.now() - started >= 900);
        assert.deepEqual(JSON.parse(reply.text), { seq: 1, epoch: epochOf(rig), reset: false, events: [] });
    } finally { rig.api.close(); }
});

test('a since older than the ring, or newer than the bus, resets', async () => {
    const rig = await startRig();
    try {
        for (let n = 0; n < 700; n += 1) { rig.bus.publish('tab', tabId('t1')); }
        const old = JSON.parse((await call(rig, 'GET', '/v1/events?since=3&wait=1')).text);
        assert.deepEqual(old, { seq: 700, epoch: epochOf(rig), reset: true, events: [] });
        const edge = JSON.parse((await call(rig, 'GET', '/v1/events?since=200&wait=1')).text);
        assert.equal(edge.reset, false);
        assert.equal(edge.events.length, 500);
        const future = JSON.parse((await call(rig, 'GET', '/v1/events?since=9999&wait=1')).text);
        assert.deepEqual(future, { seq: 700, epoch: epochOf(rig), reset: true, events: [] });
    } finally { rig.api.close(); }
});

test('a client that gives up on a long wait is dropped', async () => {
    const rig = await startRig();
    try {
        const early = new AbortController();
        const held = call(rig, 'GET', '/v1/events?since=0&wait=500', { signal: early.signal });
        held.catch(() => undefined);
        await sleep(50);
        early.abort();
        await assert.rejects(held);
    } finally { rig.api.close(); }
});

test('concurrent pollers are all woken by one publish', async () => {
    const rig = await startRig();
    try {
        const held = [1, 2, 3, 4, 5].map(() => call(rig, 'GET', '/v1/events?since=0&wait=20'));
        await sleep(150);
        rig.bus.publish('index', null);
        const bodies = (await Promise.all(held)).map((reply) => JSON.parse(reply.text));
        assert.deepEqual(bodies.map((body) => body.events.length), [1, 1, 1, 1, 1]);
    } finally { rig.api.close(); }
});

test('stopping the server releases a held poll', async () => {
    const rig = await startRig();
    const held = call(rig, 'GET', '/v1/events?since=0&wait=25');
    held.catch(() => undefined);
    await sleep(100);
    const started = Date.now();
    rig.api.close();
    const settled = await Promise.race([held.then(() => 'answered', () => 'dropped'), sleep(3000).then(() => 'stuck')]);
    assert.notEqual(settled, 'stuck');
    assert.ok(Date.now() - started < 3000);
});

test('a client that disconnects leaves no waiter behind', async () => {
    const rig = await startRig();
    try {
        const gone = new AbortController();
        const held = call(rig, 'GET', '/v1/events?since=0&wait=25', { signal: gone.signal });
        held.catch(() => undefined);
        await sleep(100);
        gone.abort();
        await sleep(100);
        rig.bus.publish('index', null);
        const next = JSON.parse((await call(rig, 'GET', '/v1/events?since=0&wait=1')).text);
        assert.equal(next.events.length, 1);
    } finally { rig.api.close(); }
});
