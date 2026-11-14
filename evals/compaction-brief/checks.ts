export interface OwnSource {
    readonly recent: readonly { readonly text: string }[];
    readonly history: readonly { readonly text: string; readonly why: string | null }[];
}

export const ownOf = (input: OwnSource): string =>
    [...input.recent.map((entry) => entry.text), ...input.history.flatMap((item) => [item.text, item.why ?? ''])].join('\n');

const URL_PATTERN = /https?:\/\/[^\s<>"'`)\]]+/g;
const PATH_PATTERN = /(?:~\/|\.{1,2}\/|\/)?[\w.@+-]+(?:\/[\w.@+-]+)+/g;
const FILE_PATTERN = /\b[\w-]+\.(?:ts|tsx|js|mjs|rs|py|go|kt|md|sql|toml|yaml|yml|json|csv|tsv|xml)\b/g;
const REFERENCE_PATTERN = /(?<![\w])![0-9]+\b/g;
const COMMIT_PATTERN = /\b(?=[0-9a-f]*[0-9])(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/g;

const trimmed = (token: string): string => token.replace(/[.,;:!?'"`)\]]+$/u, '');

const isPath = (token: string): boolean => token.split('/').length > 2 || /\.\w+$/u.test(token.split('/').at(-1) ?? '');

export function tokensOf(text: string): readonly string[] {
    const urls = [...text.matchAll(URL_PATTERN)].map((hit) => trimmed(hit[0]));
    const rest = text.replace(URL_PATTERN, ' ');
    const paths = [...rest.matchAll(PATH_PATTERN)].map((hit) => trimmed(hit[0])).filter(isPath);
    const files = [...rest.matchAll(FILE_PATTERN)].map((hit) => hit[0]);
    const references = [...rest.matchAll(REFERENCE_PATTERN)].map((hit) => hit[0]);
    const commits = [...rest.matchAll(COMMIT_PATTERN)].map((hit) => hit[0]);
    return [...new Set([...urls, ...paths, ...files, ...references, ...commits].filter((token) => token !== ''))];
}

export const unknownTokens = (answer: string, allowed: readonly string[]): readonly string[] =>
    tokensOf(answer).filter((token) => !allowed.some((known) => known.includes(token)));

const ENGLISH = new Set(['the', 'and', 'to', 'of', 'is', 'that', 'we', 'i', 'it', 'in', 'for', 'not', 'with', 'must', 'keep', 'was', 'are', 'be', 'this', 'on', 'as', 'by', 'because', 'still', 'want', 'decided', 'have', 'has', 'before', 'after', 'never', 'my', 'our', 'what', 'which', 'when', 'until', 'from', 'at', 'an']);
const OTHER = new Set(['el', 'la', 'los', 'las', 'que', 'de', 'y', 'en', 'un', 'una', 'se', 'por', 'para', 'con', 'del', 'al', 'es', 'como', 'porque', 'antes', 'nunca', 'debe', 'os', 'um', 'uma', 'não', 'nao', 'da', 'em', 'é', 'ser', 'com', 'dos', 'das', 'na', 'ao', 'tem', 'foi', 'sem', 'mais', 'e', 'o']);

export interface LanguageShare {
    readonly words: number;
    readonly english: number;
    readonly other: number;
}

export function languageShare(text: string): LanguageShare {
    const words = text.toLowerCase().match(/\p{L}+/gu) ?? [];
    const share = (set: ReadonlySet<string>): number => (words.length === 0 ? 0 : words.filter((word) => set.has(word)).length / words.length);
    return { words: words.length, english: share(ENGLISH), other: share(OTHER) };
}

export function isEnglish(text: string): boolean {
    const share = languageShare(text);
    return share.words > 0 && share.english >= 0.15 && share.english > share.other * 2;
}

const MARKUP = [/^\s{0,3}#{1,6}\s/mu, /^\s*[-*+]\s+\S/mu, /^\s*\d+[.)]\s+\S/mu, /```/u];

export const isPlain = (text: string): boolean => MARKUP.every((pattern) => !pattern.test(text));

export const INPUT_WORDS = /\b(tools?|compaction_input|session_history|current_recap)\b/giu;

export function inputWordsIn(text: string, own: string): readonly string[] {
    const spoken = new Set([...own.matchAll(INPUT_WORDS)].map((hit) => hit[0].toLowerCase().replace(/s$/u, '')));
    return [...text.matchAll(INPUT_WORDS)].map((hit) => hit[0]).filter((word) => !spoken.has(word.toLowerCase().replace(/s$/u, '')));
}
