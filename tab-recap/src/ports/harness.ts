import type { BackendText } from '#src/recap/domain/ids.ts';
import type { ConfinementCell, ConfinementNoticeLine, ConfinementState, CostBasis } from '#src/recap/domain/confinement-notice.ts';
import type { Count } from '#src/recap/domain/count.ts';
import type { Effort } from '#src/recap/domain/effort.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Milliseconds } from '#src/recap/domain/time.ts';
import type { Usd } from '#src/recap/domain/usd.ts';
import type { Unknown } from '@stateforge-labs/session-ledger/unstable/ports/unknowable.ts';

export type AnswerSchema = 'writer' | 'reconcile' | 'story';

export interface TextAnswer {
    readonly kind: 'text';
}

export interface SchemaAnswer {
    readonly kind: 'schema';
    readonly schema: AnswerSchema;
}

export type AnswerMode = TextAnswer | SchemaAnswer;

export type StructuredSupport = 'none' | 'schema';

export type ToolSupport = 'none' | 'stdio';

export interface HarnessAsk {
    readonly instructions: Text;
    readonly input: Text;
    readonly answer?: AnswerMode;
}

export interface HarnessChoice {
    readonly model: Text;
    readonly effort: Effort;
    readonly timeoutMs?: Milliseconds;
}

export type { ConfinementCell, ConfinementNoticeLine, ConfinementState, CostBasis };

export type LogLine = (line: ConfinementNoticeLine) => void;

export interface RanText {
    readonly kind: 'ran';
    readonly text: Text;
    readonly costUsd: Usd;
    readonly costBasis?: CostBasis;
    readonly confinement?: readonly ConfinementCell[];
}

export type HarnessRun = RanText | Unknown;

export interface HarnessPort<Id extends Text = Text> {
    readonly id: Id;
    label(settings: HarnessChoice): Text;
    readonly limit: Count | null;
    readonly structured?: StructuredSupport;
    readonly tools?: ToolSupport;
    run(call: HarnessAsk, settings: HarnessChoice): Promise<HarnessRun>;
}

export type BackendHarness = HarnessPort<BackendText>;
