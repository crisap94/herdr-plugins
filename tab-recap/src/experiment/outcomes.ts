import { must } from '@stateforge-labs/session-ledger';
import { parseCount, type Count } from '@stateforge-labs/session-ledger';
import type { Text } from '@stateforge-labs/session-ledger';
import type { Instant } from '@stateforge-labs/session-ledger';
import { jaccardOf, wordsIn, type Flag } from './stats.ts';


export interface Boundary { readonly kind: 'boundary'; readonly pos: Count; readonly at: Instant | null; readonly trigger: Text | null; readonly pre: Count | null; readonly post: Count | null }

export interface ToolCall { readonly kind: 'tool'; readonly reads: readonly Text[] }

export interface Prompt { readonly kind: 'prompt'; readonly text: Text }

export type TranscriptEvent = ToolCall | Prompt | Boundary;

export interface BoundaryOutcome {
    readonly pos: Count;
    readonly at: Instant | null;
    readonly trigger: Text | null;
    readonly preTokens: Count | null;
    readonly postTokens: Count | null;
    readonly reReads: Count;
    readonly restated: Flag;
    readonly followed: Flag;
}

export const CALLS_BEFORE = 50;
export const CALLS_AFTER = 10;
export const PROMPTS_BEFORE = 20;
export const RESTATED_AT = 0.5;

const toolsOf = (events: readonly TranscriptEvent[]): readonly (readonly Text[])[] => events.flatMap((event) => (event.kind === 'tool' ? [event.reads] : []));

export function boundaryOutcome(boundary: Boundary, before: readonly TranscriptEvent[], after: readonly TranscriptEvent[]): BoundaryOutcome {
    const [earlier, later] = [toolsOf(before).slice(-CALLS_BEFORE), toolsOf(after).slice(0, CALLS_AFTER)];
    const seen = new Set(earlier.flat());
    const again = new Set(later.flat().filter((path) => seen.has(path)));
    const firstPrompt = after.find((event) => event.kind === 'prompt');
    const prompts = before.flatMap((event) => (event.kind === 'prompt' ? [event.text] : [])).slice(-PROMPTS_BEFORE);
    const restated = firstPrompt?.kind === 'prompt' && prompts.some((text) => jaccardOf(wordsIn(text), wordsIn(firstPrompt.text)) >= RESTATED_AT);
    return {
        pos: boundary.pos, at: boundary.at, trigger: boundary.trigger, preTokens: boundary.pre, postTokens: boundary.post, reReads: must(parseCount(again.size)),
        restated: restated ? 'yes' : 'no', followed: later.length > 0 || firstPrompt !== undefined ? 'yes' : 'no',
    };
}

export function boundaryOutcomes(events: readonly TranscriptEvent[]): readonly BoundaryOutcome[] {
    const marks = events.flatMap((event, index) => (event.kind === 'boundary' ? [{ boundary: event, index }] : []));
    return marks.map(({ boundary, index }, n) => boundaryOutcome(boundary, events.slice(0, index), events.slice(index + 1, marks[n + 1]?.index ?? events.length)));
}
