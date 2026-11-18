import { err, ok, type Result } from '#src/protocol/result.ts';
import type { Gate } from './gates/gate.ts';
import { LEDGER_GATES } from './gates/ledger-gates.ts';
import type { ParseFailure } from './parse-failure.ts';
export const PIPELINES = ['one', 'enumerate', 'enumerate+gates', 'full'] as const;
export type Pipeline = (typeof PIPELINES)[number];

export const DEFAULT_PIPELINE: Pipeline = 'one';

export const pipelineOf = (raw: string | undefined): Pipeline | null => PIPELINES.find((each) => each === (raw ?? '').trim().toLowerCase()) ?? null;

const NEW_GATES: ReadonlySet<string> = new Set(['G11', 'G12']);

export const gatesOf = (pipeline: Pipeline): readonly Gate[] => (pipeline === 'enumerate' ? LEDGER_GATES.filter((gate) => !NEW_GATES.has(gate.id)) : LEDGER_GATES);

export const retriesTargeted = (pipeline: Pipeline): boolean => pipeline !== 'enumerate';

export type CloseEvidence = 'off' | 'on';

export function parseCloseEvidence(input: unknown): Result<CloseEvidence, ParseFailure> {
    if (input === undefined) {
        return ok('off');
    }
    if (typeof input !== 'string') {
        return err({ kind: 'out-of-range' });
    }
    const folded = input.trim().toLowerCase();
    if (folded === 'on') {
        return ok('on');
    }
    return folded === '' || folded === 'off' ? ok('off') : err({ kind: 'out-of-range' });
}

export const closeEvidenceOr = (read: Result<CloseEvidence, ParseFailure>): CloseEvidence => (read.kind === 'ok' ? read.value : 'off');
