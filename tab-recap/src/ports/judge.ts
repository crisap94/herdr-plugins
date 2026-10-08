import type { Unknown } from './unknowable.ts';

/** `score`: every added item against the rubric, key facts and the state's coverage · `cover`: which facts of a state carry given (or listed) key facts · `readback`: six questions answered from the recap alone · `grade`: those answers against the input. */
export type JudgeTask = 'score' | 'readback' | 'grade' | 'cover';

export type Said = { readonly kind: 'said'; readonly text: string; readonly costUsd: number } | Unknown;

/** The judge job: one model call per task, from one document, answering JSON. */
export interface Judge {
    /** which harness · model · effort judges: stored with every verdict */
    readonly label: string;
    ask(task: JudgeTask, document: string): Promise<Said>;
}

/** One correction by the operator where the judge was wrong: the item's text, what the operator decided and why. */
export interface CheckAnchor {
    readonly item: string;
    readonly pass: boolean;
    readonly reason: string;
}

/** The corrections per check id, newest first. */
export type CheckAnchors = ReadonlyMap<string, readonly CheckAnchor[]>;
