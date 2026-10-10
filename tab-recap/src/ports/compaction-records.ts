import type { Origin } from '#src/recap/domain/origin.ts';
export type ActiveStage = 'briefing' | 'compacting' | 'restoring';
export type EndStage = 'compacted' | 'failed' | 'unconfirmed' | 'skipped';
export type Stage = ActiveStage | EndStage;

export type BriefOrigin = 'written' | 'template';

export interface CompactionRecord {
    readonly id: string;
    readonly tab: string;
    readonly pane: string;
    readonly agent: string;
    readonly stage: Stage;
    readonly brief: BriefOrigin | null;
    readonly writer: string | null;
    readonly templateWhy: string | null;
    readonly startedAt: number;
    readonly stageAt: number;
    readonly finishedAt: number | null;
    readonly tokensBefore: number | null;
    readonly tokensAfter: number | null;
    readonly tookMs: number | null;
    readonly retried: boolean;
    readonly why: string | null;
    readonly origin: Origin;
}

export interface BeginCompaction {
    readonly tab: string;
    readonly pane: string;
    readonly agent: string;
    readonly stage: Stage;
    readonly at: number;
    readonly writer?: string | null;
    readonly why?: string | null;
    readonly origin?: Origin;
    readonly answer?: string | null;
}

export interface StageFacts {
    readonly at: number;
    readonly brief?: BriefOrigin | null;
    readonly writer?: string | null;
    readonly templateWhy?: string | null;
}

export interface CompactionEnd {
    readonly stage: EndStage;
    readonly at: number;
    readonly tokensBefore?: number | null;
    readonly tokensAfter?: number | null;
    readonly tookMs?: number | null;
    readonly retried?: boolean;
    readonly why?: string | null;
}

export interface CompactionView {
    shownFor(tab: string): readonly CompactionRecord[];
    autoInProgress(): boolean;
}

export interface CompactionRecords extends CompactionView {
    begin(start: BeginCompaction): string;
    advance(id: string, stage: ActiveStage, facts: StageFacts): void;
    finish(id: string, end: CompactionEnd): void;
    dismissTurn(tab: string, pane: string, at: number): void;
    interrupted(at: number, why: string): number;
    unfinishedAsks(): readonly { readonly pane: string; readonly answer: string }[];
}
