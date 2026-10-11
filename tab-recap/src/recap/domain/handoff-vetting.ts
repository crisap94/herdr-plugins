import { FORBIDDEN, FORBIDDEN_PHRASE_PATTERN } from './forbidden-words.ts';
import type { HandoffText } from './handoff-sanitize.ts';

export const isForbidden = (text: HandoffText): boolean => FORBIDDEN.test(text) || text.search(FORBIDDEN_PHRASE_PATTERN) !== -1;
