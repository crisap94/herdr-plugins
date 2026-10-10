import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jobTagFor } from '#src/daemon/harness-makers.ts';
import { JOB_CALLS, JOB_TAG_BY_CALL } from '#src/recap/domain/job-tag.ts';

test('the harness job calls map to the closed tags, and the setting gates every mapping', () => {
    assert.deepEqual(JOB_CALLS.map((call) => JOB_TAG_BY_CALL[call]), ['recap-writer', 'recap-writer', 'curator', 'decider', 'judge', 'compaction-brief', 'coverage-check']);
    for (const call of JOB_CALLS) {
        assert.equal(jobTagFor({ telemetryTags: 'on' }, call), JOB_TAG_BY_CALL[call]);
        assert.equal(jobTagFor({ telemetryTags: 'off' }, call), undefined);
    }
});
