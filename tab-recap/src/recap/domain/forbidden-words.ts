export const FORBIDDEN_WORDS = ['recaps?', 'plugins?', 'herdr', 'tabs?'] as const;
export const FORBIDDEN_PHRASES = ['tab-recap', 'recap column'] as const;

const WORD_ALTERNATION = `\\b(${FORBIDDEN_WORDS.join('|')})\\b`;
const PHRASE_ALTERNATION = `\\b(${FORBIDDEN_PHRASES.join('|')})\\b`;

export const FORBIDDEN = new RegExp(WORD_ALTERNATION, 'iu');
export const FORBIDDEN_WORD_PATTERN = new RegExp(WORD_ALTERNATION, 'giu');
export const FORBIDDEN_PHRASE_PATTERN = new RegExp(PHRASE_ALTERNATION, 'giu');
