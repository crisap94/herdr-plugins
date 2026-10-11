import { FORBIDDEN, FORBIDDEN_PHRASE_PATTERN } from './forbidden-words.ts';

export const isForbidden = (text: string): boolean => FORBIDDEN.test(text) || text.search(FORBIDDEN_PHRASE_PATTERN) !== -1;
