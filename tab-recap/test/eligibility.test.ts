import assert from 'node:assert/strict';
import test from 'node:test';
import { COMPACTABLE } from '#src/recap/domain/compaction.ts';
import { AGENT_KINDS } from '#src/recap/domain/agent-kinds.ts';
import { KINDS_DEFAULT } from '#src/recap/domain/autocompact.ts';
import { DEFAULT_POLICY } from '#src/recap/domain/policy.ts';

test('eligibility lists preserve the current defaults', () => {
    assert.deepEqual(COMPACTABLE, ['claude', 'codex', 'opencode']);
    assert.deepEqual(DEFAULT_POLICY.kinds, ['claude', 'codex', 'opencode']);
    assert.deepEqual(KINDS_DEFAULT, ['claude']);
});

test('every agent kind declares each eligibility capability as a boolean', () => {
    for (const [kind, capabilities] of Object.entries(AGENT_KINDS)) {
        assert.deepEqual(Object.keys(capabilities).toSorted(), ['autocompactDefault', 'compactable', 'defaultPolicy'], kind);
        assert.equal(typeof capabilities.compactable, 'boolean', kind);
        assert.equal(typeof capabilities.defaultPolicy, 'boolean', kind);
        assert.equal(typeof capabilities.autocompactDefault, 'boolean', kind);
    }
});
