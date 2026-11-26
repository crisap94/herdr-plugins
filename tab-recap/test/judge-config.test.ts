import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judgeJobOf } from './fakes/settings-readers.ts';

const config = (values: Readonly<Record<string, string>>) => (key: string): string | undefined => values[key];

test('the judge has no time limit of its own: TAB_RECAP_JUDGE_TIMEOUT_MS sets none', () => {
    assert.equal('timeoutMs' in judgeJobOf(config({ TAB_RECAP_JUDGE_TIMEOUT_MS: '90000' })), false);
});
