import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compactionPlans } from '#src/adapters/compaction-plan-registry.ts';
import { needsIdle, NotAReasonError, QUEUES } from '#src/recap/domain/compaction-plan.ts';
import type { CompactionPlan } from '#src/recap/domain/compaction-plan.ts';

const plain = (raw: CompactionPlan): unknown => ({
    lines: raw.lines.map((line) => line.pieces.map(String)),
    enterDelay: Number(raw.enterDelay),
    confirm: raw.confirm.kind === 'turn-end' ? raw.confirm : { ...raw.confirm, reads: Number(raw.confirm.reads), every: Number(raw.confirm.every) },
    retryOnSelfFailure: raw.retryOnSelfFailure,
    followUp: raw.followUp,
    whileWorking: raw.whileWorking.kind === 'queues' ? raw.whileWorking : { kind: 'needs-idle', reason: String(raw.whileWorking.reason) },
});

const registeredPlan = (kind: 'claude' | 'codex' | 'opencode', guidance: string): CompactionPlan => {
    const result = compactionPlans.forKind(kind, guidance);
    assert.equal(result.kind, 'supported');
    return result.plan;
};

test('registered kinds expose their current behavior as typed plans', () => {
    assert.deepEqual(plain(registeredPlan('claude', 'guidance')), {
        lines: [['/compact ', 'guidance']], enterDelay: 300, confirm: { kind: 'turn-end' }, retryOnSelfFailure: true, followUp: { kind: 'none' }, whileWorking: { kind: 'needs-idle', reason: 'queued input is not proven for this kind yet' },
    });
    assert.deepEqual(plain(registeredPlan('codex', 'unused')), {
        lines: [['/compact']], enterDelay: 300, confirm: { kind: 'poll', reads: 20, every: 1000 }, retryOnSelfFailure: false, followUp: { kind: 'restore-message', acceptsStall: true }, whileWorking: { kind: 'needs-idle', reason: 'queued input is not measured for this kind' },
    });
    assert.deepEqual(plain(registeredPlan('opencode', 'unused')), {
        lines: [['/compact']], enterDelay: 300, confirm: { kind: 'poll', reads: 20, every: 1000 }, retryOnSelfFailure: false, followUp: { kind: 'restore-message', acceptsStall: true }, whileWorking: { kind: 'needs-idle', reason: 'queued input is not measured for this kind' },
    });
});

test('plan lookup refuses an unregistered lane kind explicitly', () => {
    assert.deepEqual(compactionPlans.forKind('zed', 'guidance'), { kind: 'unsupported', why: 'no compaction plan is registered for zed' });
});

test('a kind that needs the lane idle must say why; one that queues says nothing', () => {
    assert.throws(() => needsIdle(''), NotAReasonError);
    assert.throws(() => needsIdle('   '), NotAReasonError);
    assert.deepEqual(needsIdle(' not measured '), { kind: 'needs-idle', reason: 'not measured' });
    assert.deepEqual(QUEUES, { kind: 'queues' });
});

test('every registered kind declares what happens while it works', () => {
    for (const kind of ['claude', 'codex', 'opencode'] as const) {
        assert.equal(registeredPlan(kind, 'unused').whileWorking.kind, 'needs-idle', kind);
    }
});
