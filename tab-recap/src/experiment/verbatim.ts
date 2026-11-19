import { must } from '#src/protocol/result.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';

const PATH = /(?:~|\.{1,2})?\/[\w.@+-]+(?:\/[\w.@+-]+)+|\b[\w.-]+\/[\w.-]+\.\w{1,6}\b/g;
const HASH = /\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/g;
const ERROR_LINE = /^.*(?:Error|FAIL|Traceback).*$/gm;
const MIN_LINE = 12;

type VerbatimLabel = 0 | 1;

export function verbatimTokens(text: Text): readonly Text[] {
    const lines = (text.match(ERROR_LINE) ?? []).map((line) => line.trim()).filter((line) => line.length >= MIN_LINE);
    return [...new Set([...(text.match(PATH) ?? []), ...(text.match(HASH) ?? []), ...lines])].map((token) => must(parseText(token)));
}

export const onlyInRecent = (recent: Text, own: Text): readonly Text[] => verbatimTokens(recent).filter((token) => !own.includes(token));

export function verbatimLabel(recent: Text, own: Text, agentNext: Text): VerbatimLabel {
    return onlyInRecent(recent, own).some((token) => agentNext.includes(token)) ? 1 : 0;
}
