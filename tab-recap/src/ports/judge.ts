import type { Text } from '@stateforge-labs/session-ledger';
import type { Usd } from '@stateforge-labs/session-ledger';
import type { Unknown } from '@stateforge-labs/session-ledger';

export type JudgeTask = 'score' | 'readback' | 'grade' | 'cover';

export interface SaidText {
    readonly kind: 'said';
    readonly text: Text;
    readonly costUsd: Usd;
}

export type JudgeAnswer = SaidText | Unknown;

export interface JudgePort {
    readonly label: Text;
    ask(task: JudgeTask, document: Text): Promise<JudgeAnswer>;
}

export type AnchorVerdict = 'pass' | 'fail';

export interface AnchorCheck {
    readonly item: Text;
    readonly verdict: AnchorVerdict;
    readonly reason: Text;
}

export type AnchorChecks = ReadonlyMap<Text, readonly AnchorCheck[]>;
