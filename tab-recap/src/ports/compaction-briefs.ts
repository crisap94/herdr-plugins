import type { Unknown } from './unknowable.ts';

export type Briefed = { readonly kind: 'briefed'; readonly text: string } | Unknown;

/** Writes what an agent's own summary must keep, from one `compaction_input` document. */
export interface CompactionBriefs {
    /** which harness/model writes (logged with a fallback) */
    readonly backend: string;
    /** the job as it runs, for the lane: "codex · gpt-6-luna · high" */
    readonly job: string;
    write(document: string): Promise<Briefed>;
}
