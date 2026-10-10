import type { Gate } from './gates/gate.ts';
import { LEDGER_GATES } from './gates/ledger-gates.ts';
export const PIPELINES = ['one', 'enumerate', 'enumerate+gates', 'full'] as const;
export type Pipeline = (typeof PIPELINES)[number];

export const DEFAULT_PIPELINE: Pipeline = 'one';

export const pipelineOf = (raw: string | undefined): Pipeline | null => PIPELINES.find((each) => each === (raw ?? '').trim().toLowerCase()) ?? null;

const NEW_GATES: ReadonlySet<string> = new Set(['G11', 'G12']);

export const gatesOf = (pipeline: Pipeline): readonly Gate[] => (pipeline === 'enumerate' ? LEDGER_GATES.filter((gate) => !NEW_GATES.has(gate.id)) : LEDGER_GATES);

export const retriesTargeted = (pipeline: Pipeline): boolean => pipeline !== 'enumerate';
