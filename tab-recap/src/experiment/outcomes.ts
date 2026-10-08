// What followed a compaction: the files read again and the operator saying something again. Pure over a transcript's events.
import { jaccard, wordsOf } from './stats.ts';

export type Event =
    | { readonly kind: 'tool'; readonly reads: readonly string[] }
    | { readonly kind: 'prompt'; readonly text: string }
    | { readonly kind: 'boundary'; readonly pos: number; readonly at: number | null; readonly trigger: string | null; readonly pre: number | null; readonly post: number | null };

export interface Outcome {
    readonly pos: number;
    readonly at: number | null;
    readonly trigger: string | null;
    readonly preTokens: number | null;
    readonly postTokens: number | null;
    /** paths read in the 50 tool calls before and read again in the 10 after */
    readonly reReads: number;
    readonly restated: boolean;
    /** whether any tool call or operator prompt followed at all */
    readonly followed: boolean;
}

export const CALLS_BEFORE = 50;
export const CALLS_AFTER = 10;
export const PROMPTS_BEFORE = 20;
export const RESTATED_AT = 0.5;

const toolsOf = (events: readonly Event[]): readonly (readonly string[])[] => events.flatMap((event) => (event.kind === 'tool' ? [event.reads] : []));

/** One boundary's outcome from the events before it and after it (up to the next boundary). */
export function outcomeOf(boundary: Extract<Event, { kind: 'boundary' }>, before: readonly Event[], after: readonly Event[]): Outcome {
    const [earlier, later] = [toolsOf(before).slice(-CALLS_BEFORE), toolsOf(after).slice(0, CALLS_AFTER)];
    const seen = new Set(earlier.flat());
    const again = new Set(later.flat().filter((path) => seen.has(path)));
    const firstPrompt = after.find((event) => event.kind === 'prompt');
    const prompts = before.flatMap((event) => (event.kind === 'prompt' ? [event.text] : [])).slice(-PROMPTS_BEFORE);
    const restated = firstPrompt?.kind === 'prompt' && prompts.some((text) => jaccard(wordsOf(text), wordsOf(firstPrompt.text)) >= RESTATED_AT);
    return { pos: boundary.pos, at: boundary.at, trigger: boundary.trigger, preTokens: boundary.pre, postTokens: boundary.post, reReads: again.size, restated, followed: later.length > 0 || firstPrompt !== undefined };
}

/** The outcome of every boundary in an event list. */
export function outcomesOf(events: readonly Event[]): readonly Outcome[] {
    const marks = events.flatMap((event, index) => (event.kind === 'boundary' ? [index] : []));
    return marks.map((index, n) => {
        const boundary = events[index] as Extract<Event, { kind: 'boundary' }>;
        return outcomeOf(boundary, events.slice(0, index), events.slice(index + 1, marks[n + 1] ?? events.length));
    });
}
