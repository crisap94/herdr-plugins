import test from 'node:test';
import assert from 'node:assert/strict';
import { BACKEND_IDS, AUTO_ORDER, JOB_HARNESSES, LEGACY_MODEL_KEYS, MODEL_DEFAULTS } from '#src/recap/domain/backend.ts';
import { JOB_BY_CHOICES } from '#src/recap/domain/job.ts';
import { MAKERS } from '#src/daemon/harness-makers.ts';

test('the typed registry derives the existing ordered job harness lists and defaults', () => {
    assert.deepEqual(BACKEND_IDS, ['claude', 'codex', 'opencode', 'hermes', 'custom']);
    assert.deepEqual(AUTO_ORDER, ['claude', 'codex', 'opencode', 'hermes']);
    assert.deepEqual(MODEL_DEFAULTS, { claude: 'haiku', codex: '', opencode: '', hermes: '', custom: '' });
    assert.deepEqual(JOB_BY_CHOICES, ['recap', 'auto', 'claude', 'codex', 'opencode', 'hermes', 'custom', 'off']);
    assert.deepEqual(LEGACY_MODEL_KEYS, ['TAB_RECAP_CLAUDE_MODEL', 'TAB_RECAP_CODEX_MODEL']);
});

test('every registered job harness has a maker', () => {
    assert.deepEqual(Object.keys(MAKERS).toSorted(), [...BACKEND_IDS].toSorted());
});

test('custom declares the free-text contract, no model and no enumerator', () => {
    const custom = JOB_HARNESSES.find((harness) => harness.job.contract === 'free-text');
    assert.deepEqual(custom, {
        id: 'custom',
        label: 'custom',
        model: null,
        automatic: false,
        availabilityMark: false,
        customCommand: true,
        job: { contract: 'free-text', enumerates: false, envScrub: [] },
    });
});
