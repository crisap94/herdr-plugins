import type { GateStats } from '#src/recap/domain/gates/index.ts';

export interface StoredRun {
    readonly id: string;
    readonly tab: string;
    readonly at: number;
    readonly language: string;
    readonly backend: string | null;
    readonly hasInput: boolean;
    readonly gateStats: GateStats | null;
}

export interface RunItem {
    readonly key: string;
    readonly section: string;
    readonly text: string;
    readonly fact: string;
    readonly born: boolean;
    readonly anchor: string | null;
}

export type ItemsMode = 'added' | 'state';

export interface RunQuery {
    readonly tab: string | null;
    readonly since: number | null;
    readonly limit: number;
    readonly withInput: boolean;
}

export interface RunInputs {
    runs(query: RunQuery): readonly StoredRun[];
    document(run: string): string | null;
    itemsOf(run: string, mode: ItemsMode): readonly RunItem[];
    gateCounts(since: number | null): readonly { readonly at: number; readonly stats: GateStats }[];
    prune(before: number): number;
}
