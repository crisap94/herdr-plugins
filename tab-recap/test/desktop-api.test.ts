import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tabId } from '#src/recap/domain/ids.ts';
import { instant } from '#src/recap/domain/time.ts';
import { apiProblems } from '#test/gui-schema-support.ts';
import { call, json, publishIndex, startRig } from '#test/desktop-api-support.ts';

test('a request needs the bearer token', async () => {
    const rig = await startRig();
    try {
        for (const token of [null, 'wrong', `${rig.token}0`]) {
            const reply = await call(rig, 'GET', '/v1/index', { token });
            assert.equal(reply.status, 401);
            assert.deepEqual(json(reply), { error: 'unauthorized' });
            assert.deepEqual(apiProblems(json(reply), 'error'), []);
        }
        assert.equal((await call(rig, 'GET', '/v1/index')).status, 200);
    } finally { rig.api.close(); }
});

test('the Host header must be this server, and no CORS header is ever sent', async () => {
    const rig = await startRig();
    try {
        const bad = await call(rig, 'GET', '/v1/health', { host: 'evil.example:80' });
        assert.equal(bad.status, 403);
        assert.deepEqual(json(bad), { error: 'bad-host' });
        assert.equal((await call(rig, 'GET', '/v1/health', { host: `localhost:${rig.port}` })).status, 200);
        const ok = await call(rig, 'GET', '/v1/health');
        for (const reply of [bad, ok]) {
            assert.deepEqual(Object.keys(reply.headers).filter((name) => name.startsWith('access-control')), []);
        }
    } finally { rig.api.close(); }
});

test('a body over 64 KiB is refused with 413', async () => {
    const rig = await startRig();
    try {
        publishIndex(rig, ['t1']);
        const reply = await call(rig, 'POST', '/v1/tabs/t1/refresh', { body: 'x'.repeat(65_537) });
        assert.equal(reply.status, 413);
        assert.deepEqual(json(reply), { error: 'payload-too-large' });
        assert.equal((await call(rig, 'POST', '/v1/tabs/t1/refresh', { body: 'x'.repeat(1000) })).status, 202);
    } finally { rig.api.close(); }
});

test('an unknown route is 404 and a wrong method is 405', async () => {
    const rig = await startRig();
    try {
        const missing = await call(rig, 'GET', '/v1/nothing');
        assert.equal(missing.status, 404);
        assert.deepEqual(json(missing), { error: 'not-found' });
        const wrong = await call(rig, 'POST', '/v1/health');
        assert.equal(wrong.status, 405);
        assert.deepEqual(apiProblems(json(wrong), 'error'), []);
        assert.equal((await call(rig, 'GET', '/v1/tabs/t1/refresh')).status, 405);
        assert.equal((await call(rig, 'GET', '/v1/events?since=abc')).status, 400);
    } finally { rig.api.close(); }
});

test('health, index and tab documents are the files, and validate', async () => {
    const rig = await startRig();
    try {
        const health = await call(rig, 'GET', '/v1/health');
        assert.deepEqual(apiProblems(json(health), 'health'), []);
        assert.equal(JSON.parse(health.text).pid, process.pid);
        const empty = await call(rig, 'GET', '/v1/index');
        assert.deepEqual(apiProblems(json(empty), 'index'), []);
        const indexText = JSON.stringify({ version: 1, tabs: [{ tab: 'a b' }] });
        const tabText = JSON.stringify({ version: 2, tab: 'a b', extra: 'é' });
        writeFileSync(join(rig.dir, 'index.json'), indexText);
        writeFileSync(join(rig.dir, `${encodeURIComponent('a b')}.json`), tabText);
        const index = await call(rig, 'GET', '/v1/index');
        const tab = await call(rig, 'GET', '/v1/tabs/a%20b');
        assert.equal(index.text, indexText);
        assert.equal(tab.text, tabText);
        assert.deepEqual(apiProblems(json(index), 'index'), []);
        assert.deepEqual(apiProblems(json(tab), 'tab'), []);
        const unknown = await call(rig, 'GET', '/v1/tabs/nope');
        assert.equal(unknown.status, 404);
        assert.deepEqual(json(unknown), { error: 'unknown-tab' });
        assert.equal((await call(rig, 'GET', '/v1/tabs/%E0%A4%A')).status, 404);
    } finally { rig.api.close(); }
});

test('refresh queues through the requests port', async () => {
    const rig = await startRig();
    try {
        publishIndex(rig, ['w1:2']);
        const reply = await call(rig, 'POST', '/v1/tabs/w1%3A2/refresh');
        assert.equal(reply.status, 202);
        assert.deepEqual(json(reply), { queued: true });
        assert.deepEqual(apiProblems(json(reply), 'queued'), []);
        assert.deepEqual(rig.asked, ['w1:2']);
    } finally { rig.api.close(); }
});

test('open holds a 60 s lease that the clock expires, and DELETE drops it', async () => {
    const rig = await startRig();
    try {
        publishIndex(rig, ['t1']);
        const tab = tabId('t1');
        assert.equal((await call(rig, 'PUT', '/v1/tabs/t1/open')).status, 204);
        assert.equal(rig.leases.held(tab, instant(rig.clock.at)), 'yes');
        rig.clock.at += 59_000;
        assert.equal(rig.leases.held(tab, instant(rig.clock.at)), 'yes');
        await call(rig, 'PUT', '/v1/tabs/t1/open');
        rig.clock.at += 59_000;
        assert.equal(rig.leases.held(tab, instant(rig.clock.at)), 'yes');
        rig.clock.at += 2000;
        assert.equal(rig.leases.held(tab, instant(rig.clock.at)), 'no');
        await call(rig, 'PUT', '/v1/tabs/t1/open');
        assert.equal((await call(rig, 'DELETE', '/v1/tabs/t1/open')).status, 204);
        assert.equal(rig.leases.held(tab, instant(rig.clock.at)), 'no');
    } finally { rig.api.close(); }
});

test('api.json is owner-only, matches the server, and goes with the server and its port', async () => {
    const rig = await startRig();
    const path = join(rig.dir, 'api.json');
    assert.equal(statSync(path).mode & 0o777, 0o600);
    const found = JSON.parse(readFileSync(path, 'utf8'));
    assert.deepEqual(apiProblems(found, 'discovery'), []);
    assert.equal(found.pid, process.pid);
    assert.equal(found.port, rig.port);
    rig.api.close();
    assert.throws(() => statSync(path));
    await new Promise((resolve) => setTimeout(resolve, 50));
    await assert.rejects(call(rig, 'GET', '/v1/health'));
});
