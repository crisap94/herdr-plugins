import test from 'node:test';
import assert from 'node:assert/strict';
import { BACKEND_IDS, AUTO_ORDER, JOB_HARNESSES, LEGACY_MODEL_KEYS, MODEL_DEFAULTS } from '#src/recap/domain/backend.ts';
import type { BackendId } from '#src/recap/domain/backend.ts';
import { JOB_BY_CHOICES } from '#src/recap/domain/job.ts';
import { MAKERS } from '#src/daemon/harness-makers.ts';

type Same<Left, Right> = [Left] extends [Right] ? ([Right] extends [Left] ? true : false) : false;
type RegistryIdsAreBackendIds = Same<BackendId, (typeof JOB_HARNESSES)[number]['id']>;
const registryIdsAreBackendIds: RegistryIdsAreBackendIds = true;

test('the typed registry derives the existing ordered job harness lists and defaults', () => {
    assert.equal(registryIdsAreBackendIds, true);
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
    const custom = JOB_HARNESSES.find((harness) => harness.id === 'custom');
    assert.deepEqual(custom, {
        id: 'custom',
        label: 'custom',
        model: null,
        automatic: false,
        setupNote: 'custom-command',
        job: { contract: 'free-text', enumerates: false },
    });
});
