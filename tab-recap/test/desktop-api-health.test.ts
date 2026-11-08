import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { apiProblems } from '#test/gui-schema-support.ts';
import { call, json, startRig } from '#test/desktop-api-support.ts';

test('health answers without a token, carries no secret, and names the daemon that wrote api.json', async () => {
    const rig = await startRig();
    try {
        const reply = await call(rig, 'GET', '/v1/health', { token: null });
        assert.equal(reply.status, 200);
        const found = JSON.parse(readFileSync(join(rig.dir, 'api.json'), 'utf8'));
        const body = json(reply);
        assert.deepEqual(Object.keys(JSON.parse(reply.text)).toSorted(), ['ok', 'pid', 'seq', 'startedAt', 'version']);
        assert.deepEqual(body, { ok: true, version: 1, pid: found.pid, startedAt: found.startedAt, seq: 0 });
        assert.deepEqual(apiProblems(body, 'health'), []);
        assert.ok(!reply.text.includes(rig.token));
        rig.bus.publish('notice', null);
        assert.equal(JSON.parse((await call(rig, 'GET', '/v1/health', { token: null })).text).seq, 1);
        assert.equal((await call(rig, 'GET', '/v1/health', { token: 'wrong' })).status, 200);
    } finally { rig.api.close(); }
});

test('health is still checked for its Host header', async () => {
    const rig = await startRig();
    try {
        const bad = await call(rig, 'GET', '/v1/health', { token: null, host: 'evil.example:80' });
        assert.equal(bad.status, 403);
        assert.deepEqual(json(bad), { error: 'bad-host' });
    } finally { rig.api.close(); }
});

test('every other route, and every other method on health, still needs the token', async () => {
    const rig = await startRig();
    try {
        const routes: readonly (readonly [string, string])[] = [
            ['GET', '/v1/index'], ['GET', '/v1/events?since=0&wait=0'], ['GET', '/v1/tabs/t1'],
            ['POST', '/v1/tabs/t1/refresh'], ['PUT', '/v1/tabs/t1/open'], ['DELETE', '/v1/tabs/t1/open'], ['POST', '/v1/health'], ['GET', '/v1/nothing'],
        ];
        for (const [method, path] of routes) {
            const reply = await call(rig, method, path, { token: null });
            assert.equal(reply.status, 401, `${method} ${path}`);
            assert.deepEqual(json(reply), { error: 'unauthorized' });
        }
    } finally { rig.api.close(); }
});

test('every events answer carries the epoch that api.json and health name', async () => {
    const rig = await startRig();
    try {
        const found = JSON.parse(readFileSync(join(rig.dir, 'api.json'), 'utf8'));
        const polled = await call(rig, 'GET', '/v1/events?since=0&wait=0');
        assert.equal(JSON.parse(polled.text).epoch, found.startedAt);
        assert.deepEqual(apiProblems(json(polled), 'events'), []);
        rig.bus.publish('index', null);
        const later = await call(rig, 'GET', '/v1/events?since=0&wait=0');
        assert.equal(JSON.parse(later.text).epoch, found.startedAt);
        assert.deepEqual(apiProblems(json(later), 'events'), []);
    } finally { rig.api.close(); }
});
