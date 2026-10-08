// Mandatory candidates: the events a coding session is made of, found with no model in the structured tool calls and the turns. Each
// becomes a stub the enumeration must fill in or skip. Pure.
import type { Section } from '#src/recap/domain/fact.ts';
import { pieceOf } from '#src/recap/domain/quote.ts';
import type { Entry } from '#src/ports/transcripts.ts';

export type TriggerKind = 'commit' | 'edit' | 'error' | 'question';

/** What was found: where it likely belongs, what it is about, and a piece of the input that shows it (the anchor). */
export interface Stub {
    readonly kind: TriggerKind;
    readonly section: Section;
    readonly ref: string | null;
    readonly anchor: string;
    /** epoch ms of the entry */
    readonly at: number | null;
}

/** A command that starts with these makes history: a commit, a merge, a push, a tag, a pull request, a release, a merge request. */
const HISTORY = /^\s*(?:git\s+(?:-C\s+\S+\s+)?(?:commit|merge|push|tag)|gh\s+(?:pr|release)|glab\s+mr)\b/;
const ERROR = /Error|FAIL|✖|Traceback/;
const QUESTION_START = /^\s*(?:¿|(?:should|do you|can we|which|debería|deberíamos|puedes|podemos|cuál|cuáles|cual)\b)/i;
const REFERENCE = /[!#]\d+/;

const stubOf = (kind: TriggerKind, section: Section, entry: Entry, found: { readonly anchor: string; readonly ref?: string | null }): Stub =>
    ({ kind, section, ref: found.ref ?? null, anchor: found.anchor, at: entry.at ?? null });

/** Every step of a chained command that makes history: `cd x && git commit … && git push` is two. */
const historyOf = (entry: Entry): readonly Stub[] =>
    entry.text.split(/&&|\|\||;|\n/).filter((part) => HISTORY.test(part)).map((step) => stubOf('commit', 'done', entry, { anchor: pieceOf(step), ref: REFERENCE.exec(step)?.[0] ?? null }));

function errorOf(entry: Entry): Stub | null {
    const found = ERROR.exec(entry.text);
    if (found === null) {
        return null;
    }
    const start = entry.text.lastIndexOf('\n', found.index) + 1;
    const line = entry.text.slice(start, entry.text.indexOf('\n', found.index) < 0 ? undefined : entry.text.indexOf('\n', found.index));
    return stubOf('error', 'now', entry, { anchor: pieceOf(line, found.index - start) });
}

/** The last sentence when the turn ends in a question mark, else the first line when it opens like a question. */
function questionOf(entry: Entry): Stub | null {
    if (entry.role === 'tool') {
        return null;
    }
    const body = entry.text.trim();
    if (/[?？]$/.test(body)) {
        const start = Math.max(body.lastIndexOf('. '), body.lastIndexOf('! '), body.lastIndexOf('? ', body.length - 2), body.lastIndexOf('\n')) + 1;
        return stubOf('question', 'needs', entry, { anchor: pieceOf(body.slice(start), Number.MAX_SAFE_INTEGER) });
    }
    return entry.role === 'user' && QUESTION_START.test(body) ? stubOf('question', 'needs', entry, { anchor: pieceOf(body.split('\n')[0] ?? body) }) : null;
}

function editOf(entry: Entry): Stub | null {
    return entry.role === 'tool' && entry.kind === 'edit' && entry.text.trim() !== '' ? stubOf('edit', 'done', entry, { anchor: pieceOf(entry.text), ref: pieceOf(entry.text) }) : null;
}

const finders = (entry: Entry): readonly (Stub | null)[] => [
    ...(entry.role === 'tool' && entry.kind === 'shell' ? historyOf(entry) : []), errorOf(entry), questionOf(entry), editOf(entry),
];

/** The stubs of `entries`, oldest first; the same anchor of the same kind is one. */
export function triggersOf(entries: readonly Entry[]): readonly Stub[] {
    const seen = new Set<string>();
    return entries.flatMap(finders).flatMap((stub) => {
        const key = `${stub?.kind ?? ''}\u0000${stub?.anchor ?? ''}`;
        if (stub === null || seen.has(key)) {
            return [];
        }
        seen.add(key);
        return [stub];
    });
}

/** The most stubs one chunk carries. */
export const MAX_STUBS = 12;
const WEIGHT: Readonly<Record<TriggerKind, number>> = { commit: 0, error: 1, question: 2, edit: 3 };

/** At most `max` stubs, the heavier kinds first (a commit before an error before a question before an edit), in their order of time. */
export function capStubs(stubs: readonly Stub[], max = MAX_STUBS): readonly Stub[] {
    const kept = new Set(stubs.toSorted((a, b) => WEIGHT[a.kind] - WEIGHT[b.kind]).slice(0, max));
    return stubs.filter((stub) => kept.has(stub));
}
