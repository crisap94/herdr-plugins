import type { Unknown } from './unknowable.ts';

export interface Noul {
    readonly instructions: string | object;
    readonly criteria: { readonly true: string | object; readonly false: string | object };
}

export interface Decided {
    readonly kind: 'decided';
    readonly answers: Readonly<Record<string, number>>;
    readonly tokens: number;
    readonly costUsd: number;
    readonly tookMs: number;
    readonly model: string;
}

export type DecidedResult = Decided | Unknown;

export interface Decider {
    readonly label: string;
    ask(state: object, questions: Readonly<Record<string, Noul>>): Promise<DecidedResult>;
}
