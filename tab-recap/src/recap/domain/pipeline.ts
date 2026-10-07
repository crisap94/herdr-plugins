// The steps a run's new turns go through to become operations. `one` is the single call of 2.0; the rest read the turns first.
export const PIPELINES = ['one', 'enumerate', 'enumerate+gates', 'full'] as const;
export type Pipeline = (typeof PIPELINES)[number];

/** What a run does until told otherwise. */
export const DEFAULT_PIPELINE: Pipeline = 'full';

/** The pipeline a setting names; null when it names none. */
export const pipelineOf = (raw: string | undefined): Pipeline | null => PIPELINES.find((each) => each === (raw ?? '').trim().toLowerCase()) ?? null;
