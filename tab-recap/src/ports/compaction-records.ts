export type ActiveStage = 'briefing' | 'compacting' | 'restoring';
export type EndStage = 'compacted' | 'failed' | 'unconfirmed' | 'skipped';
export type Stage = ActiveStage | EndStage;

/** Where the brief came from: written by the brief job, or the template (then `templateWhy` says why). */
export type BriefOrigin = 'written' | 'template';

/** One compaction of one lane, as the daemon wrote it and the column, the bar and the modal read it. */
export interface CompactionRecord {
    /** the TypeID, `cmp_…` */
    readonly id: string;
    readonly tab: string;
    readonly pane: string;
    readonly agent: string;
    readonly stage: Stage;
    readonly brief: BriefOrigin | null;
    /** the brief job as it ran: "codex · gpt-6-luna · high" */
    readonly writer: string | null;
    readonly templateWhy: string | null;
    readonly startedAt: number;
    /** when the current stage began: the stage clock starts here */
    readonly stageAt: number;
    readonly finishedAt: number | null;
    readonly tokensBefore: number | null;
    readonly tokensAfter: number | null;
    readonly tookMs: number | null;
    readonly retried: boolean;
    readonly why: string | null;
    /** who started it: the operator, or autocompact */
    readonly origin: 'operator' | 'auto';
}

export interface BeginCompaction {
    readonly tab: string;
    readonly pane: string;
    readonly agent: string;
    readonly stage: Stage;
    readonly at: number;
    readonly writer?: string | null;
    /** a compaction that ends where it begins (skipped, failed) says why */
    readonly why?: string | null;
    /** `operator` unless given */
    readonly origin?: 'operator' | 'auto';
}

/** What a stage change adds: the brief's origin and writer are known once the brief job is done. */
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

/** What the column, the bar and the modal read. */
export interface CompactionView {
    /** the newest record of each lane of the tab that the agent's next turn has not dismissed yet */
    shownFor(tab: string): readonly CompactionRecord[];
}

/** The compaction records: the daemon writes them (every write is one transaction), everything else reads. */
export interface CompactionRecords extends CompactionView {
    /** the new record's TypeID */
    begin(start: BeginCompaction): string;
    advance(id: string, stage: ActiveStage, facts: StageFacts): void;
    finish(id: string, end: CompactionEnd): void;
    /** the lane's agent started a turn at `at`: ended records of the lane stop being shown */
    dismissTurn(tab: string, pane: string, at: number): void;
    /** the daemon started: whatever was still in progress becomes `unconfirmed`, so no lane spins forever; how many */
    interrupted(at: number, why: string): number;
}
