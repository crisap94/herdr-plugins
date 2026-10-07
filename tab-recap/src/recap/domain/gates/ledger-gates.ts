// The gates that look at operations against the ledger. The rubric's gates (G1, G3–G5, G7–G9) are listed with them where the two meet.
import { closeWhyGate } from './g10-close-why.ts';
import { duplicateGate } from './g2-ledger-duplicate.ts';
import { itemGate } from './item-gates.ts';
import { unknownIdGate } from './g6-unknown-id.ts';
import type { Gate } from './gate.ts';

export const LEDGER_GATES: readonly Gate[] = [duplicateGate, unknownIdGate, closeWhyGate, itemGate];
