import assert from 'node:assert/strict';
import test from 'node:test';
import { kindsWith } from '@stateforge-labs/session-ledger';
import { compactableKinds, COMPACTABLE } from '@stateforge-labs/session-ledger';
import { REGISTERED_KINDS } from '@stateforge-labs/session-ledger';
import { KINDS_DEFAULT } from '@stateforge-labs/session-ledger';
import { defaultPolicyKinds, DEFAULT_POLICY } from '#src/recap/domain/policy.ts';
import { capable } from '@stateforge-labs/session-ledger';

test('eligibility lists preserve the current defaults', () => {
    assert.deepEqual(COMPACTABLE, ['claude', 'codex', 'opencode']);
    assert.deepEqual(DEFAULT_POLICY.kinds, ['claude', 'codex', 'opencode']);
    assert.deepEqual(KINDS_DEFAULT, ['claude']);
});

test('every agent kind declares each eligibility capability as a boolean', () => {
    for (const [kind, capabilities] of Object.entries(REGISTERED_KINDS)) {
        assert.deepEqual(Object.keys(capabilities).toSorted(), ['autocompactDefault', 'compactable', 'defaultPolicy', 'hasTranscript'], kind);
        assert.equal(typeof capabilities.hasTranscript, 'boolean', kind);
        assert.equal(typeof capabilities.compactable, 'boolean', kind);
        assert.equal(typeof capabilities.defaultPolicy, 'boolean', kind);
        assert.equal(typeof capabilities.autocompactDefault, 'boolean', kind);
    }
});

test('each eligibility list reads its own capability from the supplied table', () => {
    const table = {
        claude: { hasTranscript: capable(true), compactable: capable(true), defaultPolicy: capable(false), autocompactDefault: capable(false) },
        codex: { hasTranscript: capable(false), compactable: capable(false), defaultPolicy: capable(true), autocompactDefault: capable(false) },
        opencode: { hasTranscript: capable(false), compactable: capable(false), defaultPolicy: capable(false), autocompactDefault: capable(true) },
    } as const;
    assert.deepEqual(compactableKinds(table), ['claude']);
    assert.deepEqual(defaultPolicyKinds(table), ['codex']);
    assert.deepEqual(kindsWith(table, 'autocompactDefault'), ['opencode']);
});
