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

export const JOB_BY_CHOICES: readonly JobBy[] = ['recap', 'auto', 'claude', 'codex', 'opencode', 'hermes', 'custom', 'off'];

const word = (raw: string | undefined): string => (raw ?? '').trim().toLowerCase();

/** The compaction brief's job from `TAB_RECAP_COMPACT_BY`, `_MODEL` and `_EFFORT`; unknown values are the defaults. */
export function compactJobOf(get: (key: string) => string | undefined): Job {
    return {
        by: JOB_BY_CHOICES.find((by) => by === word(get('TAB_RECAP_COMPACT_BY'))) ?? COMPACT_DEFAULT.by,
        model: (get('TAB_RECAP_COMPACT_MODEL') ?? '').trim(),
        effort: EFFORTS.find((effort) => effort === word(get('TAB_RECAP_COMPACT_EFFORT'))) ?? COMPACT_DEFAULT.effort,
    };
}

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
