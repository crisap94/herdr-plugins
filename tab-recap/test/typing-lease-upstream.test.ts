import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEASE_RETRY_MS, LEASE_TTL_MS as UPSTREAM_TTL_MS, leaseBlocked as upstreamBlocked, leaseToken, must, owner } from '@stateforge-labs/herdr-sdk/pane-tokens';
import { RETRY_MS } from '#src/recap/application/typing-lease.ts';
import { LEASE, LEASE_TTL_MS, leaseBlocked } from '#src/recap/domain/typing-lease.ts';
import { instant } from '@stateforge-labs/session-ledger';
import { tokenEntries } from './fakes/token-entries.ts';

const tab = must(owner('tab-recap'));

test('the domain copy of the lease rules equals the herdr-sdk typing rules: name, time to live, retry and every blocking case', () => {
    assert.equal(LEASE, leaseToken(tab));
    assert.equal(LEASE_TTL_MS, UPSTREAM_TTL_MS);
    assert.equal(Number(RETRY_MS), LEASE_RETRY_MS);
    const cases: ReadonlyArray<Readonly<Record<string, string>>> = [
        {}, { 'typing-coordinator': '100' }, { 'typing-coordinator': '300' }, { 'typing-aaa': '200' }, { 'typing-zzz': '200' },
        { [LEASE]: '100' }, { 'typing-coordinator': 'soon' }, { 'typing-coordinator': '' }, { 'typing-coordinator': '0' }, { 'typing-coordinator': '-5' },
        { 'typing-coordinator': '  150 ' }, { other: '100' }, { 'typing-': '100' },
    ];
    for (const record of cases) {
        for (const stamp of [0, 100, 150, 200, 300]) {
            assert.equal(leaseBlocked(tokenEntries(record), instant(stamp)) === 'blocked', upstreamBlocked(tab, record, stamp), `${JSON.stringify(record)} at ${stamp}`);
        }
    }
});
