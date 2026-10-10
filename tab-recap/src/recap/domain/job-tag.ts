export const JOB_TAGS = ['recap-writer', 'curator', 'decider', 'judge', 'compaction-brief', 'coverage-check'] as const;

export type JobTag = typeof JOB_TAGS[number];

export const JOB_CALLS = ['recapWriter', 'enumerator', 'curator', 'decider', 'judge', 'compactionBrief', 'coverageCheck'] as const;

export type JobCall = typeof JOB_CALLS[number];

export const JOB_TAG_BY_CALL: Readonly<Record<JobCall, JobTag>> = {
    recapWriter: JOB_TAGS[0],
    enumerator: JOB_TAGS[0],
    curator: JOB_TAGS[1],
    decider: JOB_TAGS[2],
    judge: JOB_TAGS[3],
    compactionBrief: JOB_TAGS[4],
    coverageCheck: JOB_TAGS[5],
};

export const JOB_ATTRIBUTE_KEY = 'tab_recap.job';

export type JobAttributes = Readonly<{ [JOB_ATTRIBUTE_KEY]: JobTag }>;

export function isJobTag(value: unknown): value is JobTag {
    return typeof value === 'string' && (JOB_TAGS as readonly string[]).includes(value);
}
