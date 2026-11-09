import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OpenLeases } from '#src/adapters/desktop/lease.ts';
import { LEASE_CAP, LEASE_MS } from '#src/adapters/desktop/constants.ts';
import { tabId } from '#src/recap/domain/ids.ts';
import { instant } from '#src/recap/domain/time.ts';
import { apiProblems } from '#test/gui-schema-support.ts';
import { call, json, publishIndex, startRig, type Rig } from '#test/desktop-api-support.ts';

const named = (n: number): string => `t${n}`;

function publish(rig: Rig, count: number): void {
    publishIndex(rig, Array.from({ length: count }, (_, n) => named(n)));
}

test('the lease map is capped: expired entries are dropped first, then a new tab is refused', () => {
    let at = 1_000;
    const leases = new OpenLeases(() => instant(at));
    for (let n = 0; n < LEASE_CAP; n += 1) { assert.equal(leases.renew(tabId(named(n))), 'yes'); }
    assert.equal(leases.size(), LEASE_CAP);
    assert.equal(leases.renew(tabId('extra')), 'no');
    assert.equal(leases.renew(tabId(named(0))), 'yes');
    assert.equal(leases.size(), LEASE_CAP);
    at += LEASE_MS + 1;
    assert.equal(leases.renew(tabId('extra')), 'yes');
    assert.equal(leases.size(), 1);
    leases.drop(tabId('extra'));
    assert.equal(leases.size(), 0);
});

test('a full lease map answers 429 too-many-leases, still renews a held tab, and frees room when leases expire or drop', async () => {
    const rig = await startRig();
    try {
        publish(rig, LEASE_CAP + 1);
        for (let n = 0; n < LEASE_CAP; n += 1) { assert.equal((await call(rig, 'PUT', `/v1/tabs/${named(n)}/open`)).status, 204); }
        const refused = await call(rig, 'PUT', `/v1/tabs/${named(LEASE_CAP)}/open`);
        assert.equal(refused.status, 429);
        assert.deepEqual(json(refused), { error: 'too-many-leases' });
        assert.deepEqual(apiProblems(json(refused), 'error'), []);
        assert.equal((await call(rig, 'PUT', `/v1/tabs/${named(0)}/open`)).status, 204);
        assert.equal((await call(rig, 'DELETE', `/v1/tabs/${named(1)}/open`)).status, 204);
        assert.equal((await call(rig, 'PUT', `/v1/tabs/${named(LEASE_CAP)}/open`)).status, 204);
        assert.equal((await call(rig, 'PUT', `/v1/tabs/${named(1)}/open`)).status, 429);
        rig.clock.at += LEASE_MS + 1;
        assert.equal((await call(rig, 'PUT', `/v1/tabs/${named(1)}/open`)).status, 204);
    } finally { rig.api.close(); }
});

test('expired leases are pruned on every lease, not only when the map is full', () => {
    let at = 1_000;
    const leases = new OpenLeases(() => instant(at));
    leases.renew(tabId('a'));
    leases.renew(tabId('b'));
    at += LEASE_MS + 1;
    assert.equal(leases.size(), 2);
    leases.renew(tabId('c'));
    assert.equal(leases.size(), 1);
});

test('lease, release and refresh for a tab missing from the published index are 404 unknown-tab', async () => {
    const rig = await startRig();
    try {
        publishIndex(rig, ['t1']);
        const calls: readonly (readonly [string, string])[] = [['PUT', '/v1/tabs/ghost/open'], ['DELETE', '/v1/tabs/ghost/open'], ['POST', '/v1/tabs/ghost/refresh'], ['PUT', '/v1/tabs/index/open']];
        for (const [method, path] of calls) {
            const refused = await call(rig, method, path);
            assert.equal(refused.status, 404, `${method} ${path}`);
            assert.deepEqual(json(refused), { error: 'unknown-tab' });
        }
        assert.deepEqual(rig.asked, []);
        assert.equal(rig.leases.held(tabId('ghost'), instant(rig.clock.at)), 'no');
        assert.equal((await call(rig, 'PUT', '/v1/tabs/t1/open')).status, 204);
        assert.equal((await call(rig, 'POST', '/v1/tabs/t1/refresh')).status, 202);
        assert.equal((await call(rig, 'DELETE', '/v1/tabs/t1/open')).status, 204);
    } finally { rig.api.close(); }
});

test('with no index published every tab is unknown', async () => {
    const rig = await startRig();
    try {
        assert.equal((await call(rig, 'PUT', '/v1/tabs/t1/open')).status, 404);
    } finally { rig.api.close(); }
});
