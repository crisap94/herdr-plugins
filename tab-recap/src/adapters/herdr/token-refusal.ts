import type { LaneTokenMap } from '#src/ports/lane-tokens.ts';
import type { Unknown } from '#src/ports/unknowable.ts';
import type { TokenName } from '#src/protocol/primitives.ts';
import { refusalOf } from './token-refusal/legacy.ts';

export { refusalOf } from './token-refusal/legacy.ts';

export const refusalOfTokens = (tokens: LaneTokenMap, allowed: readonly TokenName[]): Unknown | null => refusalOf(Object.fromEntries(tokens), allowed);
