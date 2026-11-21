import type { Ask, AskLedger } from '#src/ports/ask-ledger.ts';
import type { CompactionRecords } from '#src/ports/compaction-records.ts';
import type { Exchange } from '#src/protocol/exchange.ts';
import type { LaneTokens } from '#src/ports/lane-tokens.ts';
import type { Requests } from '#src/ports/requests.ts';

export interface RestartDeps {
    readonly exchanges: readonly Exchange[];
    readonly ledger: AskLedger;
    readonly requests: Pick<Requests, 'takeAnswered'>;
    readonly compactions: Pick<CompactionRecords, 'interrupted'>;
    readonly tokens: Pick<LaneTokens, 'report'>;
    readonly enabled: () => boolean;
    readonly local: (ask: Ask) => void;
    readonly handoff: (ask: Ask) => void;
    readonly withdraw: (ask: Ask) => void;
    readonly log: (line: string) => void;
    readonly now: () => number;
    readonly restartedWhy: string;
}
