import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handoffPlans } from '#src/adapters/handoff-plan-registry.ts';
import { REGISTERED_KINDS } from '#src/recap/domain/registered-kinds.ts';
import type { HandoffPlan } from '#src/recap/domain/handoff-plan.ts';
import { HANDOFF_SETTLE_MAX_MS } from '#src/recap/application/handoff-limits.ts';

const planOf = (kind: string): HandoffPlan => {
    const result = handoffPlans.forKind(kind);
    if (result.kind !== 'supported') throw new Error(`${kind} has no plan`);
    return result.plan;
};

test('the registered kinds with a handoff plan are exactly the ones declared here', () => {
    const withPlan = Object.keys(REGISTERED_KINDS).filter((kind) => handoffPlans.forKind(kind).kind === 'supported');
    assert.deepEqual(withPlan, ['claude', 'codex', 'opencode']);
});

test('Hermes declares no handoff plan', () => {
    assert.deepEqual(handoffPlans.forKind('hermes'), { kind: 'unsupported', reason: 'no-plan' });
});

test('an unregistered lane kind has no handoff plan', () => {
    assert.deepEqual(handoffPlans.forKind('zed'), { kind: 'unsupported', reason: 'no-plan' });
});

test('Claude delivers by prompt with a measured settle time and locates its transcript by session', () => {
    assert.deepEqual(planOf('claude'), {
        delivery: 'prompt', evidence: 'either', retry: 'none', settle: { after: 10_000, measured: true }, locatedBy: 'session',
    });
});

test('Codex and OpenCode declare the unmeasured settle time and locate their transcript by directory', () => {
    for (const kind of ['codex', 'opencode']) {
        assert.deepEqual(planOf(kind), {
            delivery: 'prompt', evidence: 'either', retry: 'none', settle: { after: 10_000, measured: false }, locatedBy: 'directory',
        });
    }
});

test('no declared settle time exceeds the flow bound', () => {
    for (const kind of Object.keys(REGISTERED_KINDS)) {
        const result = handoffPlans.forKind(kind);
        if (result.kind === 'supported') {
            assert.ok(result.plan.settle.after <= HANDOFF_SETTLE_MAX_MS, kind);
        }
    }
});
