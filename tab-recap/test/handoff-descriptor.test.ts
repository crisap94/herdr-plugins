import { test } from 'node:test';
import assert from 'node:assert/strict';
import { capabilityValue } from '#src/protocol/capability.ts';
import { terminalStage, terminalsOf, parseRequest } from '#src/protocol/exchange.ts';
import { EXCHANGES } from '#src/protocol/exchanges/index.ts';
import { handoff } from '#src/protocol/exchanges/handoff.ts';
import { exchangeVersion, LIMITS } from '#src/protocol/primitives.ts';
import { must } from '#src/protocol/result.ts';
import { HANDOFF_DEADLINE_MS, HANDOFF_FLOW_MAX_MS, HANDOFF_TAKE_MAX_AGE_MS } from '#src/recap/application/handoff-limits.ts';
import { HANDOFF_OUTCOME_ROWS } from '#src/recap/domain/handoff-outcome.ts';
import { REGISTRY } from '#src/recap/domain/token-registry.ts';

test('the request name is at most 32 characters and the longest answer fits 80 with a 16-character id', () => {
    assert.equal(handoff.requestPrefix.length + LIMITS.toolMax, LIMITS.nameMax);
    const stages = [...handoff.answerStages, ...terminalsOf(handoff).map(terminalStage)];
    const longest = Math.max(...stages.map((stage) => stage.length));
    assert.equal(LIMITS.idMax + 1 + longest, 45);
    assert.ok(LIMITS.idMax + 1 + longest <= LIMITS.valueMax);
});

test('the target is the workspace and pane parts, and refresh is read only as the literal last field', () => {
    assert.deepEqual(must(parseRequest(handoff, 'h1:w2:p7:refresh')), { id: 'h1', workspace: 'w2', pane: 'p7', refresh: true });
    assert.deepEqual(must(parseRequest(handoff, 'h1:w2:p7')), { id: 'h1', workspace: 'w2', pane: 'p7', refresh: false });
    assert.equal(parseRequest(handoff, 'h1:w2:refresh').kind, 'err');
});

test('the handoff capability is listed only when its setting is on', () => {
    const version = must(exchangeVersion(1));
    assert.equal(must(capabilityValue(EXCHANGES, version, (setting) => setting === 'TAB_RECAP_HERDR_EVENTS')), 'compact1,kinds1');
    assert.equal(must(capabilityValue(EXCHANGES, version, () => true)), 'compact1,handoff1,kinds1');
});

test('tab-recap names nine per pane: the lane tokens, the event, the lease, the capability and two answers', () => {
    assert.equal(REGISTRY.ownNames.length, 9);
});

test('the published deadline is the handoff deadline: the take age bound plus the longest flow', () => {
    assert.equal(handoff.timing['deadline-ms'], HANDOFF_DEADLINE_MS);
    assert.equal(HANDOFF_DEADLINE_MS, HANDOFF_TAKE_MAX_AGE_MS + HANDOFF_FLOW_MAX_MS);
});

test('the descriptor declares every storable refusal, unsupported and failure of the handoff flow', () => {
    const declared = terminalsOf(handoff).map(terminalStage);
    for (const row of HANDOFF_OUTCOME_ROWS) {
        if (row.storable && row.reason !== null && row.outcome !== 'delivered') {
            assert.ok(declared.includes(`${row.outcome}-${row.reason}`), `${row.outcome}-${row.reason}`);
        }
    }
});
