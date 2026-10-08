import type { Unknown } from './unknowable.ts';

/** One yes/no question about a state: what to judge, and what makes the answer true or false. Each part is text or a small structure. */
export interface Noul {
    readonly instructions: string | object;
    readonly criteria: { readonly true: string | object; readonly false: string | object };
}

/** The answers, one probability in [0, 1] per question id, with what asking them took. */
export interface Decided {
    readonly kind: 'decided';
    readonly answers: Readonly<Record<string, number>>;
    /** input tokens the decider reports (an estimate when it reports none) */
    readonly tokens: number;
    readonly costUsd: number;
    readonly tookMs: number;
    /** who answered: the model id, or `harness/model` */
    readonly model: string;
}

export type DecidedResult = Decided | Unknown;

/** Answers typed yes/no questions about a state. The questions are the caller's; the verdict is made from the answers, in code. */
export interface Decider {
    /** what a decision is signed with in the log and the records: `jev · jev-1.13.0`, `claude · default · low` */
    readonly label: string;
    ask(state: object, questions: Readonly<Record<string, Noul>>): Promise<DecidedResult>;
}
