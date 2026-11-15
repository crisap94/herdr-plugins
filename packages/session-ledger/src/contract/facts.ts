export interface HistoryFact {
    readonly section: string;
    readonly text: string;
    readonly why: string | null;
    readonly state: 'open' | 'closed';
    readonly closedWhy: string | null;
    readonly closedAt: number | null;
    readonly firstAt: number;
    readonly lastAt: number;
}

export interface Fact { readonly pendingStep: 'FND-2b' }
export interface TaskId { readonly pendingStep: 'FND-2b' }
