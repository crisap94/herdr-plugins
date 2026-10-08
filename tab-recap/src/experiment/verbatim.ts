// The deterministic cross-check of `needs_verbatim`: material found only in the recent turns that the agent then uses. Pure.

const PATH = /(?:~|\.{1,2})?\/[\w.@+-]+(?:\/[\w.@+-]+)+|\b[\w.-]+\/[\w.-]+\.\w{1,6}\b/g;
const HASH = /\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/g;
const ERROR_LINE = /^.*(?:Error|FAIL|Traceback).*$/gm;
const MIN_LINE = 12;

/** Paths, error lines and hex hashes (7 or more) found in a text. */
export function verbatimTokens(text: string): readonly string[] {
    const lines = (text.match(ERROR_LINE) ?? []).map((line) => line.trim()).filter((line) => line.length >= MIN_LINE);
    return [...new Set([...(text.match(PATH) ?? []), ...(text.match(HASH) ?? []), ...lines])];
}

/** The tokens of `recent` that `own` (goal and open work) does not carry. */
export const onlyInRecent = (recent: string, own: string): readonly string[] => verbatimTokens(recent).filter((token) => !own.includes(token));

/** 1 when any token found only in the recent turns shows up in what the agent did next. */
export function verbatimLabel(recent: string, own: string, agentNext: string): 0 | 1 {
    return onlyInRecent(recent, own).some((token) => agentNext.includes(token)) ? 1 : 0;
}
