import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isJobTag, JOB_TAGS } from '#src/recap/domain/job-tag.ts';
import type { JobTag } from '#src/recap/domain/job-tag.ts';

test('the job tag vocabulary is closed and every value is recognized', () => {
    assert.deepEqual(JOB_TAGS, ['recap-writer', 'curator', 'decider', 'judge', 'compaction-brief', 'coverage-check']);
    for (const value of JOB_TAGS) {
        assert.equal(isJobTag(value), true);
    }
    assert.equal(isJobTag('unknown'), false);
    // @ts-expect-error
    const invalid: JobTag = 'unknown';
    void invalid;
});
