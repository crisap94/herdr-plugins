import { JOB_HARNESSES, pick } from '@stateforge-labs/session-ledger/unstable/recap/domain/backend.ts';
import type { BackendChoice, BackendId } from '@stateforge-labs/session-ledger/unstable/recap/domain/backend.ts';
import { parseText, type Text } from '@stateforge-labs/session-ledger/unstable/recap/domain/text.ts';
import { must } from '#src/protocol/result.ts';
import { parseMilliseconds } from '@stateforge-labs/session-ledger/unstable/recap/domain/time.ts';
import type { Milliseconds } from '@stateforge-labs/session-ledger/unstable/recap/domain/time.ts';
import { parseCount } from './count.ts';
import type { Count } from './count.ts';
import { EFFORTS } from './effort.ts';
import type { Effort } from './effort.ts';
import type { DeciderJob, Job } from './legacy.ts';

export { compactJobOf, coverageJobOf, curateJobOf, deciderJobOf, judgeJobOf, keepDaysOf, placementOf } from './legacy.ts';
export type { DeciderJob, Job, RecapChoices } from './legacy.ts';

export type JobBy = BackendChoice | 'recap' | 'off';

export type JobAnswer = 'text' | 'schema';

export type DeciderBy = JobBy | 'jev';

export interface DeciderSetting<By extends DeciderBy = DeciderBy> {
    readonly by: By;
    readonly model: Text;
    readonly effort: Effort;
}

export interface JobSetting extends DeciderSetting<JobBy> {
    readonly timeoutMs?: Milliseconds;
    readonly answer?: JobAnswer;
}

export interface JobPlacement {
    readonly harness: BackendId;
    readonly model: Text;
    readonly effort: Effort;
    readonly timeoutMs?: Milliseconds;
    readonly answer?: JobAnswer;
}

export interface RecapSetting {
    readonly backend: BackendChoice;
    readonly models: Readonly<Record<BackendId, Text>>;
}

export type JobPrefix = 'TAB_RECAP_JUDGE' | 'TAB_RECAP_COMPACT' | 'TAB_RECAP_CURATE' | 'TAB_RECAP_AUTOCOMPACT';

export type JobKey = `${JobPrefix}_${'BY' | 'MODEL' | 'EFFORT'}` | 'TAB_RECAP_CURATE_TIMEOUT_MS' | 'TAB_RECAP_CURATE_ANSWER' | 'TAB_RECAP_AUTOCOMPACT_COVERAGE_MODEL' | 'TAB_RECAP_AUTOCOMPACT_COVERAGE_EFFORT';

export type JobReader = (key: JobKey) => Text | undefined;

export const JOB_BY_CHOICES: readonly JobBy[] = ['recap', 'auto', ...JOB_HARNESSES.map(({ id }) => id), 'off'];

export const DECIDER_BY_CHOICES: readonly DeciderBy[] = [...JOB_BY_CHOICES.slice(0, -1), 'jev', 'off'];

const NO_MODEL = must(parseText(''));

const COMPACT_SETTING: JobSetting = { by: 'recap', model: NO_MODEL, effort: 'high' };

const JUDGE_SETTING: JobSetting = { by: 'recap', model: NO_MODEL, effort: 'medium' };

const CURATE_SETTING: JobSetting = { by: 'recap', model: NO_MODEL, effort: 'medium' };

const DECIDER_SETTING: DeciderSetting = { by: 'recap', model: NO_MODEL, effort: 'low' };

export const COMPACT_DEFAULT: Job = COMPACT_SETTING;

export const JUDGE_DEFAULT: Job = JUDGE_SETTING;

export const CURATE_DEFAULT: Job = CURATE_SETTING;

export const DECIDER_DEFAULT: DeciderJob = DECIDER_SETTING;

export const KEEP_INPUT_DAYS = 14;

const textOf = (raw: Text | undefined): Text => must(parseText((raw ?? NO_MODEL).trim()));

function settingFrom<By extends DeciderBy>(get: JobReader, prefix: JobPrefix, fallback: DeciderSetting<By>, choices: readonly By[]): DeciderSetting<By> {
    return {
        by: choices.find((by) => by === textOf(get(`${prefix}_BY`)).toLowerCase()) ?? fallback.by,
        model: textOf(get(`${prefix}_MODEL`)),
        effort: EFFORTS.find((effort) => effort === textOf(get(`${prefix}_EFFORT`)).toLowerCase()) ?? fallback.effort,
    };
}

export const judgeSettingOf = (get: JobReader): JobSetting => settingFrom(get, 'TAB_RECAP_JUDGE', JUDGE_SETTING, JOB_BY_CHOICES);

export const compactSettingOf = (get: JobReader): JobSetting => settingFrom(get, 'TAB_RECAP_COMPACT', COMPACT_SETTING, JOB_BY_CHOICES);

export function curateSettingOf(get: JobReader): JobSetting {
    const job = settingFrom(get, 'TAB_RECAP_CURATE', CURATE_SETTING, JOB_BY_CHOICES);
    const raw = textOf(get('TAB_RECAP_CURATE_TIMEOUT_MS'));
    const count = Number(raw);
    const limit = parseMilliseconds(count);
    const timed: JobSetting = raw !== '' && Number.isInteger(count) && count > 0 && limit.kind === 'ok' ? { ...job, timeoutMs: limit.value } : job;
    return textOf(get('TAB_RECAP_CURATE_ANSWER')).toLowerCase() === 'schema' ? { ...timed, answer: 'schema' } : timed;
}

export const deciderSettingOf = (get: JobReader): DeciderSetting => settingFrom(get, 'TAB_RECAP_AUTOCOMPACT', DECIDER_SETTING, DECIDER_BY_CHOICES);

export function coverageSettingOf(get: JobReader, decider: DeciderSetting): DeciderSetting {
    const model = textOf(get('TAB_RECAP_AUTOCOMPACT_COVERAGE_MODEL'));
    const effort = EFFORTS.find((choice) => choice === textOf(get('TAB_RECAP_AUTOCOMPACT_COVERAGE_EFFORT')).toLowerCase());
    return { by: decider.by, model: model === '' ? decider.model : model, effort: effort ?? decider.effort };
}

export function keepDaysCountOf(raw: Text | undefined): Count {
    const text = textOf(raw);
    const days = parseCount(Number(text));
    return text !== '' && days.kind === 'ok' ? days.value : must(parseCount(KEEP_INPUT_DAYS));
}

export function placementFor(job: JobSetting, recap: RecapSetting, available: readonly BackendId[]): JobPlacement | null {
    if (job.by === 'off') {
        return null;
    }
    const harness = pick(job.by === 'recap' ? recap.backend : job.by, available);
    return harness === null ? null : { harness, model: job.model === '' ? recap.models[harness] : job.model, effort: job.effort, ...(job.timeoutMs === undefined ? {} : { timeoutMs: job.timeoutMs }), ...(job.answer === undefined ? {} : { answer: job.answer }) };
}
