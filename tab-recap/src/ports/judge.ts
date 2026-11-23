import type { Text } from '#src/recap/domain/text.ts';
import type { Usd } from '#src/recap/domain/usd.ts';
import type { Unknown } from '@stateforge-labs/session-ledger/unstable/ports/unknowable.ts';

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
