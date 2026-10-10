import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRegistry } from '#src/protocol/registry.ts';
import { capabilityValue, CAPABILITY_TOKEN } from '#src/protocol/capability.ts';
import { EXCHANGES } from '#src/protocol/exchanges/index.ts';
import { exchangeVersion } from '#src/protocol/primitives.ts';
import { ownerTable } from '#src/protocol/owners.ts';
import { must } from '#src/protocol/result.ts';
import { handoffLike } from './fakes/protocol-exchanges.ts';
import { ANSWER_TOKENS, REGISTRY } from '#src/recap/domain/token-registry.ts';
import { COMPACT_TOKEN, OWNED_TOKENS, PANE_WRITABLE, WORKSPACE_WRITABLE } from '#src/recap/domain/lane-tokens.ts';
import { REQUEST_PREFIX } from '#src/recap/domain/compact-request.ts';

test('the capability value for compact alone is compact1,kinds1', () => {
    assert.deepEqual(capabilityValue(EXCHANGES, must(exchangeVersion(1))), { kind: 'ok', value: 'compact1,kinds1' });
});

test('the compact names are derived from its descriptor: request prefix and answer token', () => {
    assert.equal(REQUEST_PREFIX, 'compact-req-');
    assert.equal(COMPACT_TOKEN, 'tab-recap-compact');
    assert.deepEqual(ANSWER_TOKENS, ['tab-recap-compact']);
});

test('the owner tables are derived: lane names and the answer cleared with the lane, the capability token, the pane and workspace writers', () => {
    assert.deepEqual(OWNED_TOKENS, ['tab-recap-api', 'tab-recap-share', 'tab-recap-recap', 'tab-recap-needs', 'tab-recap-compact', 'tab-recap-x']);
    assert.deepEqual([...PANE_WRITABLE].toSorted(), [
        'tab-recap-api', 'tab-recap-compact', 'tab-recap-event', 'tab-recap-needs', 'tab-recap-recap', 'tab-recap-share', 'tab-recap-x', 'typing-tab-recap',
    ]);
    assert.deepEqual(WORKSPACE_WRITABLE, ['tab-recap-event']);
});

test('tab-recap stays within the ten names a pane may carry', () => {
    assert.ok(REGISTRY.ownNames.length <= 10, `${REGISTRY.ownNames.length} names`);
});

test('a new exchange reaches the owner table through its descriptor alone', () => {
    const owners = ownerTable(must(buildRegistry([...EXCHANGES, handoffLike], [CAPABILITY_TOKEN])));
    assert.ok(owners.writable.some((name) => name === 'tab-recap-handoff'));
    assert.ok(owners.readPrefixes.includes('handoff-req-'));
});
