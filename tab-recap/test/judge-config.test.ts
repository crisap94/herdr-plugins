import { test } from 'node:test';
import { judgeJobOf, keepDaysOf } from './fakes/settings-readers.ts';
import assert from 'node:assert/strict';
import { KEEP_INPUT_DAYS } from '#src/recap/domain/job.ts';
import { loadSettings } from '#src/daemon/config.ts';

const config = (values: Readonly<Record<string, string>>) => (key: string): string | undefined => values[key];

test('the judge has no time limit of its own: TAB_RECAP_JUDGE_TIMEOUT_MS sets none', () => {
    assert.equal('timeoutMs' in judgeJobOf(config({ TAB_RECAP_JUDGE_TIMEOUT_MS: '90000' })), false);
});

test('the retention is 14 days unless set to a whole number of days; 0 keeps none', () => {
    assert.equal(KEEP_INPUT_DAYS, 14);
    assert.deepEqual(['', undefined, 'x', '-3', '2.5'].map(keepDaysOf), [14, 14, 14, 14, 14]);
    assert.deepEqual(['0', '7', ' 30 '].map(keepDaysOf), [0, 7, 30]);
});

test('the loaded configuration carries both', () => {
    const was = [process.env['TAB_RECAP_JUDGE_BY'], process.env['TAB_RECAP_KEEP_INPUT_DAYS']];
    process.env['TAB_RECAP_JUDGE_BY'] = 'opencode';
    process.env['TAB_RECAP_KEEP_INPUT_DAYS'] = '3';
    try {
        assert.deepEqual([loadSettings().judge.by, loadSettings().keepInputDays], ['opencode', 3]);
    } finally {
        for (const [key, value] of [['TAB_RECAP_JUDGE_BY', was[0]], ['TAB_RECAP_KEEP_INPUT_DAYS', was[1]]] as const) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
    }
});
