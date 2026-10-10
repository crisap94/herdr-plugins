import type { Section } from '#src/recap/domain/fact.ts';
import { pieceOf } from '#src/recap/domain/quote.ts';
import type { Entry } from '#src/ports/transcripts.ts';

export type TriggerKind = 'commit' | 'edit' | 'error' | 'question';

export interface Stub {
    readonly kind: TriggerKind;
    readonly section: Section;
    readonly ref: string | null;
    readonly anchor: string;
    readonly at: number | null;
}

const HISTORY = /^\s*(?:git\s+(?:-C\s+\S+\s+)?(?:commit|merge|push|tag)|gh\s+(?:pr|release)|glab\s+mr)\b/;
const ERROR = /Error|FAIL|✖|Traceback/;
const QUESTION_START = /^\s*(?:¿|(?:should|do you|can we|which|debería|deberíamos|puedes|podemos|cuál|cuáles|cual)\b)/i;
const REFERENCE = /[!#]\d+/;

const stubOf = (kind: TriggerKind, section: Section, entry: Entry, found: { readonly anchor: string; readonly ref?: string | null }): Stub =>
    ({ kind, section, ref: found.ref ?? null, anchor: found.anchor, at: entry.at ?? null });

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

export const MAX_STUBS = 12;
const WEIGHT: Readonly<Record<TriggerKind, number>> = { commit: 0, error: 1, question: 2, edit: 3 };

export function capStubs(stubs: readonly Stub[], max = MAX_STUBS): readonly Stub[] {
    const kept = new Set(stubs.toSorted((a, b) => WEIGHT[a.kind] - WEIGHT[b.kind]).slice(0, max));
    return stubs.filter((stub) => kept.has(stub));
}
