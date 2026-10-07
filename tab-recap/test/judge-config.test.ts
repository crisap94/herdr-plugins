// The judge's job and the input retention, read from the configuration: defaults, inheritance from the recap writer, overrides.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JUDGE_DEFAULT, judgeJobOf, KEEP_INPUT_DAYS, keepDaysOf, placementOf } from '#src/recap/domain/job.ts';
import { loadConfig } from '#src/daemon/config.ts';

const config = (values: Readonly<Record<string, string>>) => (key: string): string | undefined => values[key];
const models = { claude: 'sonnet', codex: 'gpt-6-luna', opencode: '', hermes: '', custom: '' };

test('the judge job defaults to the recap writer\'s harness and model at medium effort; unknown values are the defaults', () => {
    assert.deepEqual(JUDGE_DEFAULT, { by: 'recap', model: '', effort: 'medium' });
    assert.deepEqual(judgeJobOf(config({})), JUDGE_DEFAULT);
    assert.deepEqual(judgeJobOf(config({ TAB_RECAP_JUDGE_BY: 'nonsense', TAB_RECAP_JUDGE_EFFORT: 'max' })), JUDGE_DEFAULT);
});

test('the judge job takes its own harness, model and effort; `off` and `default` are kept', () => {
    assert.deepEqual(judgeJobOf(config({ TAB_RECAP_JUDGE_BY: ' Codex ', TAB_RECAP_JUDGE_MODEL: ' gpt-6-luna ', TAB_RECAP_JUDGE_EFFORT: 'HIGH' })), { by: 'codex', model: 'gpt-6-luna', effort: 'high' });
    assert.equal(judgeJobOf(config({ TAB_RECAP_JUDGE_BY: 'off' })).by, 'off');
    assert.equal(judgeJobOf(config({ TAB_RECAP_JUDGE_EFFORT: 'default' })).effort, 'default');
});

test('where the judge runs: `recap` is the writer\'s harness and its model, another harness has its own, off is nowhere', () => {
    const recap = { backend: 'claude', models } as const;
    assert.deepEqual(placementOf(JUDGE_DEFAULT, recap, ['claude', 'codex']), { harness: 'claude', model: 'sonnet', effort: 'medium' });
    assert.deepEqual(placementOf({ by: 'codex', model: '', effort: 'medium' }, recap, ['claude', 'codex']), { harness: 'codex', model: 'gpt-6-luna', effort: 'medium' });
    assert.deepEqual(placementOf({ by: 'recap', model: 'opus', effort: 'low' }, recap, ['claude']), { harness: 'claude', model: 'opus', effort: 'low' });
    assert.equal(placementOf({ by: 'off', model: '', effort: 'medium' }, recap, ['claude']), null);
    assert.equal(placementOf(JUDGE_DEFAULT, { backend: 'auto', models }, []), null, 'auto with nothing installed: no judge');
});

test('the retention is 14 days unless set to a whole number of days; 0 keeps none', () => {
    assert.equal(KEEP_INPUT_DAYS, 14);
    assert.deepEqual(['', undefined, 'x', '-3', '2.5'].map(keepDaysOf), [14, 14, 14, 14, 14]);
    assert.deepEqual(['0', '7', ' 30 '].map(keepDaysOf), [0, 7, 30]);
});

test('the loaded configuration carries both', () => {
    const was = [process.env['TAB_RECAP_JUDGE_BY'], process.env['TAB_RECAP_KEEP_INPUT_DAYS']];
    process.env['TAB_RECAP_JUDGE_BY'] = 'hermes';
    process.env['TAB_RECAP_KEEP_INPUT_DAYS'] = '3';
    try {
        assert.deepEqual([loadConfig().judge.by, loadConfig().keepInputDays], ['hermes', 3]);
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
