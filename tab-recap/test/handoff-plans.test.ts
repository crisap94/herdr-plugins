import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handoffPlans } from '#src/adapters/handoff-plan-registry.ts';
import { REGISTERED_KINDS } from '#src/recap/domain/registered-kinds.ts';
import type { HandoffPlan } from '#src/recap/domain/handoff-plan.ts';
import { HANDOFF_SETTLE_MAX_MS } from '#src/recap/application/handoff-limits.ts';
import { SETTLE_SOURCE } from '#src/adapters/handoff-plan-registry.ts';

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

test('Claude delivers by prompt with the settle time measured over its trials and locates its transcript by session', () => {
    assert.deepEqual(planOf('claude'), {
        delivery: 'prompt', evidence: 'either', retry: 'none', settle: { after: 10_000, evidence: { trials: 130, source: SETTLE_SOURCE } }, locatedBy: 'session',
    });
});

test('Codex and OpenCode settle times rest on their own trials and locate their transcript by directory', () => {
    assert.deepEqual(planOf('codex'), {
        delivery: 'prompt', evidence: 'either', retry: 'none', settle: { after: 3_000, evidence: { trials: 130, source: SETTLE_SOURCE } }, locatedBy: 'directory',
    });
    assert.deepEqual(planOf('opencode'), {
        delivery: 'prompt', evidence: 'either', retry: 'none', settle: { after: 60_000, evidence: { trials: 77, source: SETTLE_SOURCE } }, locatedBy: 'directory',
    });
});

test('the settle ceiling is the largest declared settle time', () => {
    const settles = Object.keys(REGISTERED_KINDS).flatMap((kind) => {
        const result = handoffPlans.forKind(kind);
        return result.kind === 'supported' ? [result.plan.settle.after] : [];
    });
    assert.equal(Math.max(...settles), HANDOFF_SETTLE_MAX_MS);
});

test('no declared settle time exceeds the flow bound', () => {
    for (const kind of Object.keys(REGISTERED_KINDS)) {
        const result = handoffPlans.forKind(kind);
        if (result.kind === 'supported') {
            assert.ok(result.plan.settle.after <= HANDOFF_SETTLE_MAX_MS, kind);
        }
    }
});
