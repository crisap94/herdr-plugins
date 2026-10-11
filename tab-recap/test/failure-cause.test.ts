import { test } from 'node:test';
import assert from 'node:assert/strict';
import { failureCauseOf } from '#src/recap/domain/failure-cause.ts';

test('a failure cause is the error name and its message on one line, capped at 200 code points', () => {
    assert.equal(failureCauseOf(new TypeError('bad\nvalue  here')), 'TypeError: bad value here');
    assert.equal(failureCauseOf(new Error('')), 'Error');
    assert.equal(failureCauseOf('a thrown string'), 'NonError');
    const long = failureCauseOf(new Error('😀'.repeat(300)));
    assert.equal(long, `Error: ${'😀'.repeat(200)}`);
});
