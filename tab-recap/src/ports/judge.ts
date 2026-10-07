import type { Unknown } from './unknowable.ts';

/** `score`: every item against the rubric, key facts and coverage · `readback`: six questions answered from the recap alone · `grade`: those answers against the input. */
export type JudgeTask = 'score' | 'readback' | 'grade';

export type Said = { readonly kind: 'said'; readonly text: string; readonly costUsd: number } | Unknown;

/** The judge job: one model call per task, from one document, answering JSON. */
export interface Judge {
    /** which harness · model · effort judges: stored with every verdict */
    readonly label: string;
    ask(task: JudgeTask, document: string): Promise<Said>;
}
