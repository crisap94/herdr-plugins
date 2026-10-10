import assert from 'node:assert/strict';
import test from 'node:test';
import { compactableKinds, COMPACTABLE } from '#src/recap/domain/compaction.ts';
import { REGISTERED_KINDS } from '#src/recap/domain/registered-kinds.ts';
import { autocompactDefaultKinds, KINDS_DEFAULT } from '#src/recap/domain/autocompact.ts';
import { defaultPolicyKinds, DEFAULT_POLICY } from '#src/recap/domain/policy.ts';

test('eligibility lists preserve the current defaults', () => {
    assert.deepEqual(COMPACTABLE, ['claude', 'codex', 'opencode']);
    assert.deepEqual(DEFAULT_POLICY.kinds, ['claude', 'codex', 'opencode']);
    assert.deepEqual(KINDS_DEFAULT, ['claude']);
});

test('every agent kind declares each eligibility capability as a boolean', () => {
    for (const [kind, capabilities] of Object.entries(REGISTERED_KINDS)) {
        assert.deepEqual(Object.keys(capabilities).toSorted(), ['autocompactDefault', 'compactable', 'defaultPolicy'], kind);
        assert.equal(typeof capabilities.compactable, 'boolean', kind);
        assert.equal(typeof capabilities.defaultPolicy, 'boolean', kind);
        assert.equal(typeof capabilities.autocompactDefault, 'boolean', kind);
    }
});

test('each eligibility list reads its own capability from the supplied table', () => {
    const table = {
        alpha: { compactable: true, defaultPolicy: false, autocompactDefault: false },
        beta: { compactable: false, defaultPolicy: true, autocompactDefault: false },
        gamma: { compactable: false, defaultPolicy: false, autocompactDefault: true },
    } as const;
    assert.deepEqual(compactableKinds(table), ['alpha']);
    assert.deepEqual(defaultPolicyKinds(table), ['beta']);
    assert.deepEqual(autocompactDefaultKinds(table), ['gamma']);
});
