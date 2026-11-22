import { err, ok, type Result } from '#src/protocol/result.ts';
import { FORBIDDEN, FORBIDDEN_PHRASE_PATTERN } from './forbidden-words.ts';
import type { HandoffText } from './handoff-sanitize.ts';

export interface Forbidden {
    readonly kind: 'forbidden';
}

export function vetHandoffText(text: HandoffText): Result<HandoffText, Forbidden> {
    return FORBIDDEN.test(text) || text.search(FORBIDDEN_PHRASE_PATTERN) !== -1 ? err({ kind: 'forbidden' }) : ok(text);
}
