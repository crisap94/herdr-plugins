// The steps a run's new turns go through to become operations. `one` is the single call of 2.0; the rest read the turns first.
import type { Gate } from './gates/gate.ts';
import { LEDGER_GATES } from './gates/ledger-gates.ts';
export const PIPELINES = ['one', 'enumerate', 'enumerate+gates', 'full'] as const;
export type Pipeline = (typeof PIPELINES)[number];

/**
 * What a run does until told otherwise: the single call. Measured on the 40-prompt replay (experiments/EXP-001), enumeration and
 * ask-back did not raise coverage or the read-back beyond the single call with the 2.1 gates, at 2.4–2.8× the model calls; they stay
 * behind the switch for the next measurement.
 */
export const DEFAULT_PIPELINE: Pipeline = 'one';

/** The pipeline a setting names; null when it names none. */
export const pipelineOf = (raw: string | undefined): Pipeline | null => PIPELINES.find((each) => each === (raw ?? '').trim().toLowerCase()) ?? null;

/** The gates only 2.1 has: the anchor must be in the input (G11), `answered` only closes a question (G12). */
const NEW_GATES: ReadonlySet<string> = new Set(['G11', 'G12']);

/**
 * The gates a pipeline judges its operations with. `enumerate` keeps the 2.0 set (what the writer says is judged as before; G4 and G5 flag, as
 * they do now); `one` (the baseline of 2.1), `enumerate+gates` and `full` use all of `LEDGER_GATES`.
 */
export const gatesOf = (pipeline: Pipeline): readonly Gate[] => (pipeline === 'enumerate' ? LEDGER_GATES.filter((gate) => !NEW_GATES.has(gate.id)) : LEDGER_GATES);

/** Whether the one retry sends only the refused operations (2.1) or the whole document again with a line on what was refused (2.0). */
export const retriesTargeted = (pipeline: Pipeline): boolean => pipeline !== 'enumerate';
