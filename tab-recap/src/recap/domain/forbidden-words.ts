export const FORBIDDEN_WORDS = ['recaps?', 'plugins?', 'herdr', 'tabs?'] as const;
export const FORBIDDEN_PHRASES = ['tab-recap', 'recap column'] as const;

const alternation = (words: readonly string[]): string => `\\b(${words.join('|')})\\b`;

export const FORBIDDEN = new RegExp(alternation(FORBIDDEN_WORDS), 'iu');
export const FORBIDDEN_WORD_PATTERN = new RegExp(alternation(FORBIDDEN_WORDS), 'giu');
export const FORBIDDEN_PHRASE_PATTERN = new RegExp(alternation(FORBIDDEN_PHRASES), 'giu');
