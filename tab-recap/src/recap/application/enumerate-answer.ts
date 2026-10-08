// The enumeration's answer, `{"candidates":[…],"skip":[…]}`, as candidates: tolerant of a fence around the JSON, strict about what a candidate
// is. A candidate's anchor must be a piece of the chunk it came from (or it takes the anchor of the stub it answers); one that is neither is lost.
import type { InputCandidate } from '#src/ports/recap-input.ts';
import type { Entry } from '#src/ports/transcripts.ts';
import { isSection } from '#src/recap/domain/fact.ts';
import { QUOTE_CHARS, quotedIn } from '#src/recap/domain/quote.ts';
import { stubId } from './enumerate-input.ts';
import type { Stub } from './triggers.ts';
import { localTime } from './local-time.ts';
import { objectIn, tidy } from './recap-shape.ts';

const WHY_WORDS = 24;

/** What a chunk's answer is read against. */
export interface AnswerGround {
    readonly agent: string;
    readonly entries: readonly Entry[];
    readonly stubs: readonly Stub[];
    readonly clock: { readonly now: number; readonly zone: string };
}

export interface Answered {
    /** the candidates, and the ids (`g2`) of the stubs the answer filled in */
    readonly candidates: readonly InputCandidate[];
    readonly filled: ReadonlySet<string>;
    /** the stubs the answer skipped, with the reason it gave */
    readonly skipped: ReadonlyMap<string, string>;
    /** candidates lost for want of a section, a text or an anchor that is in the chunk */
    readonly lost: number;
}

type Fields = Readonly<Record<string, unknown>>;
const isFields = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);
const maybe = (value: unknown, words: number): string | null => {
    const one = typeof value === 'string' ? tidy(value, words) : '';
    return one === '' ? null : one;
};

/** The words an entry can be quoted from: what it says, and what the agent said about the call. */
const sayings = (entries: readonly Entry[]): string => entries.map((entry) => `${entry.text}\n${entry.what ?? ''}`).join('\n');

function resolveAt(label: unknown, ground: AnswerGround): number | null {
    const { now, zone } = ground.clock;
    return typeof label === 'string' ? (ground.entries.findLast((entry) => entry.at !== undefined && localTime(entry.at, now, zone) === label.trim())?.at ?? null) : null;
}

/** The first QUOTE_CHARS characters of a quote that is too long, cut at a word edge: still a verbatim piece of what it quoted. */
function headOf(quote: string): string {
    const body = quote.trim();
    if (body.length <= QUOTE_CHARS) {
        return body;
    }
    const cut = body.slice(0, QUOTE_CHARS + 1).search(/\s\S*$/);
    return body.slice(0, cut > 0 ? cut : QUOTE_CHARS).trimEnd();
}

/** The anchor of `fields` when it is in the chunk, else the stub's it answers, else null. */
function anchorOf(fields: Fields, ground: AnswerGround, said: string): { readonly anchor: string; readonly stub: string | null } | null {
    const named = typeof fields['stub'] === 'string' ? fields['stub'] : null;
    const stub = ground.stubs.find((_, at) => stubId(at) === named);
    const quote = typeof fields['anchor'] === 'string' ? headOf(fields['anchor']) : '';
    if (quote !== '' && quotedIn(quote, said)) {
        return { anchor: quote, stub: stub === undefined ? null : named };
    }
    return stub === undefined ? null : { anchor: stub.anchor, stub: named };
}

function candidateOf(fields: Fields, ground: AnswerGround, said: string): { readonly one: InputCandidate; readonly stub: string | null } | null {
    const [section, text, found] = [fields['section'], maybe(fields['text'], 16), anchorOf(fields, ground, said)];
    if (!isSection(section) || text === null || found === null) {
        return null;
    }
    const one: InputCandidate = { section, text, why: maybe(fields['why'], WHY_WORDS), ref: maybe(fields['ref'], 8), at: resolveAt(fields['at'], ground), anchor: found.anchor, agent: ground.agent, flagged: false };
    return { one, stub: found.stub };
}

/** The ids of the stubs that a candidate shows without naming them: its anchor quotes the stub's, or the stub's quotes its. */
const showing = (candidates: readonly InputCandidate[], stubs: readonly Stub[]): readonly string[] =>
    stubs.flatMap((stub, at) => (candidates.some((one) => quotedIn(stub.anchor, one.anchor) || quotedIn(one.anchor, stub.anchor)) ? [stubId(at)] : []));

const listOf = (value: unknown): readonly unknown[] => (Array.isArray(value) ? (value as unknown[]) : []);

/** The answer for one chunk; null when it is not the JSON object the contract asks for. */
export function answeredBy(text: string, ground: AnswerGround): Answered | null {
    let parsed: unknown;
    try {
        parsed = objectIn(text);
    } catch {
        return null;
    }
    if (!isFields(parsed) || !Array.isArray(parsed['candidates'])) {
        return null;
    }
    const said = sayings(ground.entries);
    const made = listOf(parsed['candidates']).map((entry) => (isFields(entry) ? candidateOf(entry, ground, said) : null));
    const skipped = new Map(listOf(parsed['skip']).flatMap((entry) => (isFields(entry) && typeof entry['stub'] === 'string' && typeof entry['reason'] === 'string' && entry['reason'].trim() !== '' ? [[entry['stub'], entry['reason'].trim()] as const] : [])));
    const candidates = made.flatMap((each) => each?.one ?? []);
    const named = made.flatMap((each) => each?.stub ?? []);
    return { candidates, filled: new Set([...named, ...showing(candidates, ground.stubs)]), skipped, lost: made.filter((each) => each === null).length };
}
