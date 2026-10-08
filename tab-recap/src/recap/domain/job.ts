// A job is one kind of model call the plugin makes: which harness runs it, with which model, how hard it thinks. Pure.
import { pick } from './backend.ts';
import type { BackendChoice, BackendId } from './backend.ts';
import { EFFORTS } from './effort.ts';
import type { Effort } from './effort.ts';

/** `recap`: the harness the recap writer uses; `off`: the job is not done. */
export type JobBy = BackendChoice | 'recap' | 'off';

export interface Job {
    readonly by: JobBy;
    /** empty = the model configured for the harness */
    readonly model: string;
    readonly effort: Effort;
}

/** What the compaction brief does until told otherwise: the recap writer's harness and model, thinking hard. */
export const COMPACT_DEFAULT: Job = { by: 'recap', model: '', effort: 'high' };

/** What the judge does until told otherwise: the recap writer's harness and model, at medium effort. */
export const JUDGE_DEFAULT: Job = { by: 'recap', model: '', effort: 'medium' };

/** The decider's own choices: the other jobs' plus `jev` (the TypeSafe API, which is no harness). */
export type DeciderBy = JobBy | 'jev';

export interface DeciderJob {
    readonly by: DeciderBy;
    readonly model: string;
    readonly effort: Effort;
}

export const JOB_BY_CHOICES: readonly JobBy[] = ['recap', 'auto', 'claude', 'codex', 'opencode', 'hermes', 'custom', 'off'];

export const DECIDER_BY_CHOICES: readonly DeciderBy[] = [...JOB_BY_CHOICES.slice(0, -1), 'jev', 'off'];

/** What autocompact's decider does until told otherwise: the recap writer's harness and model, at low effort. */
export const DECIDER_DEFAULT: DeciderJob = { by: 'recap', model: '', effort: 'low' };

const word = (raw: string | undefined): string => (raw ?? '').trim().toLowerCase();

/** A job's settings from `<prefix>_BY`, `_MODEL` and `_EFFORT`; unknown values are `fallback`'s. */
function jobFrom(get: (key: string) => string | undefined, prefix: string, fallback: Job): Job;
function jobFrom(get: (key: string) => string | undefined, prefix: string, fallback: DeciderJob, choices: readonly DeciderBy[]): DeciderJob;
function jobFrom(get: (key: string) => string | undefined, prefix: string, fallback: DeciderJob, choices: readonly DeciderBy[] = JOB_BY_CHOICES): DeciderJob {
    return {
        by: choices.find((by) => by === word(get(`${prefix}_BY`))) ?? fallback.by,
        model: (get(`${prefix}_MODEL`) ?? '').trim(),
        effort: EFFORTS.find((effort) => effort === word(get(`${prefix}_EFFORT`))) ?? fallback.effort,
    };
}

/** The judge's job from `TAB_RECAP_JUDGE_BY`, `_MODEL` and `_EFFORT`; unknown values are the defaults. */
export const judgeJobOf = (get: (key: string) => string | undefined): Job => jobFrom(get, 'TAB_RECAP_JUDGE', JUDGE_DEFAULT);

export const KEEP_INPUT_DAYS = 14;

/** Days a run's input is kept (`TAB_RECAP_KEEP_INPUT_DAYS`): a whole number of 0 or more, 14 when missing or nonsense; 0 keeps none. */
export function keepDaysOf(raw: string | undefined): number {
    const days = Number((raw ?? '').trim());
    return (raw ?? '').trim() !== '' && Number.isInteger(days) && days >= 0 ? days : KEEP_INPUT_DAYS;
}


/** The compaction brief's job from `TAB_RECAP_COMPACT_BY`, `_MODEL` and `_EFFORT`; unknown values are the defaults. */
export const compactJobOf = (get: (key: string) => string | undefined): Job => jobFrom(get, 'TAB_RECAP_COMPACT', COMPACT_DEFAULT);

/** What the curator does until told otherwise: the recap writer's harness and model, at medium effort. */
export const CURATE_DEFAULT: Job = { by: 'recap', model: '', effort: 'medium' };

/** The curator's job from `TAB_RECAP_CURATE_BY`, `_MODEL` and `_EFFORT`; unknown values are the defaults. */
export const curateJobOf = (get: (key: string) => string | undefined): Job => jobFrom(get, 'TAB_RECAP_CURATE', CURATE_DEFAULT);

/** The decider's job from `TAB_RECAP_AUTOCOMPACT_BY`, `_MODEL` and `_EFFORT`; unknown values are the defaults. */
export const deciderJobOf = (get: (key: string) => string | undefined): DeciderJob => jobFrom(get, 'TAB_RECAP_AUTOCOMPACT', DECIDER_DEFAULT, DECIDER_BY_CHOICES);

/** Where a job runs: the harness and the model to give it. */
export interface Placement {
    readonly harness: BackendId;
    readonly model: string;
    readonly effort: Effort;
}

/** The recap writer's own choices, which `recap` inherits and every empty model falls back to. */
export interface RecapChoices {
    readonly backend: BackendChoice;
    readonly models: Readonly<Record<BackendId, string>>;
}

/** Where `job` runs given what is installed; null when it is off or no harness is there. A model of another harness than the recap writer's is its own. */
export function placementOf(job: Job, recap: RecapChoices, available: readonly string[]): Placement | null {
    if (job.by === 'off') {
        return null;
    }
    const harness = pick(job.by === 'recap' ? recap.backend : job.by, available);
    return harness === null ? null : { harness, model: job.model === '' ? recap.models[harness] : job.model, effort: job.effort };
}
