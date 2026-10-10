import { JOB_HARNESSES, pick } from './backend.ts';
import type { BackendChoice, BackendId } from './backend.ts';
import { EFFORTS } from './effort.ts';
import type { Effort } from './effort.ts';

export type JobBy = BackendChoice | 'recap' | 'off';

export interface Job {
    readonly by: JobBy;
    readonly model: string;
    readonly effort: Effort;
}

export const COMPACT_DEFAULT: Job = { by: 'recap', model: '', effort: 'high' };

export const JUDGE_DEFAULT: Job = { by: 'recap', model: '', effort: 'medium' };

export type DeciderBy = JobBy | 'jev';

export interface DeciderJob {
    readonly by: DeciderBy;
    readonly model: string;
    readonly effort: Effort;
}

export const JOB_BY_CHOICES: readonly JobBy[] = ['recap', 'auto', ...JOB_HARNESSES.map(({ id }) => id), 'off'];

export const DECIDER_BY_CHOICES: readonly DeciderBy[] = [...JOB_BY_CHOICES.slice(0, -1), 'jev', 'off'];

export const DECIDER_DEFAULT: DeciderJob = { by: 'recap', model: '', effort: 'low' };

const word = (raw: string | undefined): string => (raw ?? '').trim().toLowerCase();

function jobFrom(get: (key: string) => string | undefined, prefix: string, fallback: Job): Job;
function jobFrom(get: (key: string) => string | undefined, prefix: string, fallback: DeciderJob, choices: readonly DeciderBy[]): DeciderJob;
function jobFrom(get: (key: string) => string | undefined, prefix: string, fallback: DeciderJob, choices: readonly DeciderBy[] = JOB_BY_CHOICES): DeciderJob {
    return {
        by: choices.find((by) => by === word(get(`${prefix}_BY`))) ?? fallback.by,
        model: (get(`${prefix}_MODEL`) ?? '').trim(),
        effort: EFFORTS.find((effort) => effort === word(get(`${prefix}_EFFORT`))) ?? fallback.effort,
    };
}

export const judgeJobOf = (get: (key: string) => string | undefined): Job => jobFrom(get, 'TAB_RECAP_JUDGE', JUDGE_DEFAULT);

export const KEEP_INPUT_DAYS = 14;

export function keepDaysOf(raw: string | undefined): number {
    const days = Number((raw ?? '').trim());
    return (raw ?? '').trim() !== '' && Number.isInteger(days) && days >= 0 ? days : KEEP_INPUT_DAYS;
}


export const compactJobOf = (get: (key: string) => string | undefined): Job => jobFrom(get, 'TAB_RECAP_COMPACT', COMPACT_DEFAULT);

export const CURATE_DEFAULT: Job = { by: 'recap', model: '', effort: 'medium' };

export const curateJobOf = (get: (key: string) => string | undefined): Job => jobFrom(get, 'TAB_RECAP_CURATE', CURATE_DEFAULT);

export const deciderJobOf = (get: (key: string) => string | undefined): DeciderJob => jobFrom(get, 'TAB_RECAP_AUTOCOMPACT', DECIDER_DEFAULT, DECIDER_BY_CHOICES);

export interface Placement {
    readonly harness: BackendId;
    readonly model: string;
    readonly effort: Effort;
}

export interface RecapChoices {
    readonly backend: BackendChoice;
    readonly models: Readonly<Record<BackendId, string>>;
}

export function placementOf(job: Job, recap: RecapChoices, available: readonly string[]): Placement | null {
    if (job.by === 'off') {
        return null;
    }
    const harness = pick(job.by === 'recap' ? recap.backend : job.by, available);
    return harness === null ? null : { harness, model: job.model === '' ? recap.models[harness] : job.model, effort: job.effort };
}
