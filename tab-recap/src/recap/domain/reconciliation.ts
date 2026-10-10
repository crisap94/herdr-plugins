import type { ClosedWhy, Fact } from './fact.ts';
import { QUOTE_CHARS, quotedIn } from './quote.ts';

export const EVIDENCE_CHARS = 2 * QUOTE_CHARS;
const WHY_WORDS = 24;
const TEXT_WORDS = 16;

const CLOSES: readonly ClosedWhy[] = ['done', 'wrong', 'superseded', 'answered', 'merged'];

export type Reconciled =
    | { readonly op: 'update'; readonly id: string; readonly text: string; readonly why: string | null }
    | { readonly op: 'close'; readonly id: string; readonly why: ClosedWhy };

export interface Reconciliation {
    readonly ops: readonly Reconciled[];
    readonly refused: readonly string[];
}

type Fields = Readonly<Record<string, unknown>>;
const isFields = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);
const textOf = (value: unknown): string => (typeof value === 'string' ? value : '');

const wordsOf = (value: unknown, max: number): string | null => {
    const words = textOf(value).split(/\s+/u).filter((word) => word !== '');
    if (words.length === 0) {
        return null;
    }
    return words.length > max ? `${words.slice(0, max).join(' ')}…` : words.join(' ');
};

interface Ground {
    readonly facts: ReadonlyMap<string, Fact>;
    readonly tail: string;
    readonly touched: Set<string>;
    readonly closed: Set<string>;
    readonly kept: Set<string>;
}

type Check = (fields: Fields, ground: Ground) => string | null;

const isOpen = (id: string, ground: Ground): boolean => ground.facts.get(id)?.state === 'open' && !ground.closed.has(id);

const kind: Check = (fields) => (fields['op'] === 'add' ? 'add is not allowed: a reconciliation only changes or closes what is there' : null)
    ?? (fields['op'] === 'update' || fields['op'] === 'close' ? null : `${textOf(fields['op'])} is not an operation`);

const open: Check = (fields, ground) => {
    const id = textOf(fields['id']);
    const free = isOpen(id, ground) && !ground.touched.has(id) && !(fields['op'] === 'close' && ground.kept.has(id));
    return free ? null : `${id} is not an open fact (or is already changed)`;
};

const reason: Check = (fields, ground) => {
    if (fields['op'] !== 'close') {
        return null;
    }
    const id = textOf(fields['id']);
    if (!CLOSES.some((why) => why === fields['why'])) {
        return `close ${id} needs a reason: done, wrong, superseded, answered or merged`;
    }
    return fields['why'] === 'answered' && ground.facts.get(id)?.section !== 'needs' ? `close ${id} as answered: only a "needs" fact is answered` : null;
};

const merge: Check = (fields, ground) => {
    const [id, into] = [textOf(fields['id']), textOf(fields['into'])];
    return isOpen(into, ground) && into !== id ? null : `close ${id} as merged needs another open fact to merge into`;
};

const evidence: Check = (fields, ground) => {
    const quote = textOf(fields['evidence']);
    return quote.length <= EVIDENCE_CHARS && quotedIn(quote, ground.tail) ? null : `${textOf(fields['op'])} ${textOf(fields['id'])}: its evidence is not in the newest turns`;
};

function refusalOf(fields: Fields, ground: Ground): string | null {
    const refused = [kind, open, reason].reduce<string | null>((why, check) => why ?? check(fields, ground), null);
    return refused ?? (fields['why'] === 'merged' ? merge(fields, ground) : evidence(fields, ground));
}

function operationOf(fields: Fields): Reconciled | null {
    const id = textOf(fields['id']);
    if (fields['op'] === 'close') {
        return { op: 'close', id, why: fields['why'] as ClosedWhy };
    }
    const text = wordsOf(fields['text'], TEXT_WORDS);
    return text === null ? null : { op: 'update', id, text, why: wordsOf(fields['why'], WHY_WORDS) };
}

function answerOf(raw: string): readonly unknown[] | null {
    try {
        const parsed: unknown = JSON.parse(raw);
        return isFields(parsed) && Array.isArray(parsed['ops']) ? (parsed['ops'] as unknown[]) : [];
    } catch {
        return null;
    }
}

function entryOf(entry: unknown, ground: Ground): Reconciled | string {
    if (!isFields(entry)) {
        return 'not an operation';
    }
    const why = refusalOf(entry, ground);
    const one = why === null ? operationOf(entry) : null;
    if (one === null) {
        return why ?? 'an update needs a text';
    }
    ground.touched.add(one.id);
    if (one.op === 'close') {
        ground.closed.add(one.id);
    }
    if (one.op === 'close' && one.why === 'merged') {
        ground.kept.add(textOf(entry['into']));
    }
    return one;
}

export function reconciliationOf(answer: string, facts: ReadonlyMap<string, Fact>, tail: string): Reconciliation {
    const listed = answerOf(answer);
    if (listed === null) {
        return { ops: [], refused: ['the answer is not JSON'] };
    }
    const ground: Ground = { facts, tail, touched: new Set(), closed: new Set(), kept: new Set() };
    const entries = listed.map((entry) => entryOf(entry, ground));
    return { ops: entries.filter((one) => typeof one !== 'string'), refused: entries.filter((one) => typeof one === 'string') };
}
