// The log line of a decision: the share, the answers' figures, the verdict, the gate's mode. Pure text.
import type { Decision } from '#src/ports/autocompact-records.ts';

const WORDS: Readonly<Record<string, string>> = { closes_request: 'closes', announces_continuation: 'continues', asks_detailed_choice: 'choice', needs_verbatim: 'verbatim', changes_subject: 'subject', stuck: 'stuck' };

/** A cost in dollars as the listing and the log show it: `$0` for nothing, else five decimals. */
export const moneyOf = (usd: number): string => (usd === 0 ? '$0' : `$${usd.toFixed(5)}`);

/** `autocompact w1:p2: 61 % · closes 0.91 · … → compact (shadow)` */
export function lineOf(made: Decision, recordOnly: boolean): string {
    const figures = Object.entries(made.answers).map(([id, value]) => `${WORDS[id] ?? id} ${value.toFixed(2)}`);
    const tag = [made.gate === 'ceiling' ? 'ceiling' : null, made.mode, recordOnly ? 'record-only' : null].filter((part) => part !== null).join(', ');
    return `autocompact ${made.pane}: ${[`${made.share} %`, ...figures].join(' · ')} → ${made.verdict} (${tag})${made.why === null ? '' : `: ${made.why}`}`;
}
