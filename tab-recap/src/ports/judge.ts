import type { Unknown } from './unknowable.ts';

export type JudgeTask = 'score' | 'readback' | 'grade' | 'cover';

export type Said = { readonly kind: 'said'; readonly text: string; readonly costUsd: number } | Unknown;

export interface Judge {
    readonly label: string;
    ask(task: JudgeTask, document: string): Promise<Said>;
}

export interface CheckAnchor {
    readonly item: string;
    readonly pass: boolean;
    readonly reason: string;
}

export type CheckAnchors = ReadonlyMap<string, readonly CheckAnchor[]>;
