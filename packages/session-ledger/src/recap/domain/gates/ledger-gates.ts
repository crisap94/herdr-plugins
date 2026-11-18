import { closeWhyGate } from './g10-close-why.ts';
import { anchorGate } from './g11-anchor.ts';
import { answeredGate } from './g12-answered.ts';
import { duplicateGate } from './g2-ledger-duplicate.ts';
import { itemGate } from './item-gates.ts';
import { unknownIdGate } from './g6-unknown-id.ts';
import type { Gate } from './gate.ts';

export const LEDGER_GATES: readonly Gate[] = [duplicateGate, unknownIdGate, closeWhyGate, anchorGate, answeredGate, itemGate];
