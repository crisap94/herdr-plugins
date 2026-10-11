import type { Decision } from '#src/ports/autocompact-records.ts';
import { must } from '#src/protocol/result.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';

const WORDS: Readonly<Record<string, string>> = { closes_request: 'closes', announces_continuation: 'continues', asks_detailed_choice: 'choice', needs_verbatim: 'verbatim', changes_subject: 'subject', stuck: 'stuck' };

export type Effect = 'record-only' | 'may-act';

export const moneyOf = (usd: number): Text => must(parseText(usd === 0 ? '$0' : `$${usd.toFixed(5)}`));

export function lineOf(made: Decision, effect: Effect): Text {
    const figures = Object.entries(made.answers).map(([id, value]) => `${WORDS[id] ?? id} ${value.toFixed(2)}`);
    const tag = [made.gate === 'ceiling' ? 'ceiling' : null, made.mode, effect === 'record-only' ? 'record-only' : null].filter((part) => part !== null).join(', ');
    return must(parseText(`autocompact ${made.pane}: ${[`${made.share} %`, ...figures].join(' · ')} → ${made.verdict} (${tag})${made.why === null ? '' : `: ${made.why}`}`));
}
