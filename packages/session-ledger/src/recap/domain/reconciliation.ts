import { brand, type Brand } from './brand.ts';
import { countOf, type Count } from './count.ts';
import type { ClosedWhy, Fact } from './fact.ts';
import { QUOTE_CHARS, quotedIn } from './quote.ts';
import { textOf, type Text } from './text.ts';

export const EVIDENCE_CHARS = 2 * QUOTE_CHARS;

const CLOSES: readonly ClosedWhy[] = ['done', 'wrong', 'superseded', 'answered', 'merged'];

export interface ReconciledUpdate { readonly op: 'update'; readonly id: Text; readonly text: Text; readonly why: Text | null; }

export interface ReconciledClose { readonly op: 'close'; readonly id: Text; readonly why: ClosedWhy; }

export type Reconciled = ReconciledUpdate | ReconciledClose;

export interface Reconciliation { readonly ops: readonly Reconciled[]; readonly refused: readonly Text[]; }

type Entry = Brand<object, 'Entry'>;
type FieldName = 'op' | 'id' | 'why' | 'into' | 'evidence' | 'text';
type Standing = Brand<boolean, 'Standing'>;

const isEntry = (value: unknown): value is Entry => typeof value === 'object' && value !== null && !Array.isArray(value);

const fieldText = (entry: Entry, name: FieldName): Text => {
    const value: unknown = Reflect.get(entry, name);
    return textOf(typeof value === 'string' ? value : '');
};

const clippedWords = (entry: Entry, name: FieldName, max: Count): Text | null => {
    const words = fieldText(entry, name).split(/\s+/u).filter((word) => word !== '');
    if (words.length === 0) return null;
    return textOf(words.length > max ? `${words.slice(0, max).join(' ')}…` : words.join(' '));
};

interface Ground { readonly facts: ReadonlyMap<Text, Fact>; readonly tail: Text; readonly touched: Set<Text>; readonly closed: Set<Text>; readonly kept: Set<Text>; }

type Check = (entry: Entry, ground: Ground) => Text | null;

const isOpenIn = (id: Text, ground: Ground): Standing => brand<boolean, 'Standing'>(ground.facts.get(id)?.state === 'open' && !ground.closed.has(id));

const kind: Check = (entry) => (fieldText(entry, 'op') === 'add' ? textOf('add is not allowed: a reconciliation only changes or closes what is there') : null)
    ?? (fieldText(entry, 'op') === 'update' || fieldText(entry, 'op') === 'close' ? null : textOf(`${fieldText(entry, 'op')} is not an operation`));

const open: Check = (entry, ground) => {
    const id = fieldText(entry, 'id');
    const free = isOpenIn(id, ground) && !ground.touched.has(id) && !(fieldText(entry, 'op') === 'close' && ground.kept.has(id));
    return free ? null : textOf(`${id} is not an open fact (or is already changed)`);
};

const reason: Check = (entry, ground) => {
    const id = fieldText(entry, 'id');
    if (fieldText(entry, 'op') !== 'close') return null;
    if (!CLOSES.some((why) => why === fieldText(entry, 'why'))) return textOf(`close ${id} needs a reason: done, wrong, superseded, answered or merged`);
    return fieldText(entry, 'why') === 'answered' && ground.facts.get(id)?.section !== 'needs' ? textOf(`close ${id} as answered: only a "needs" fact is answered`) : null;
};

const merge: Check = (entry, ground) => {
    const [id, into] = [fieldText(entry, 'id'), fieldText(entry, 'into')];
    return isOpenIn(into, ground) && into !== id ? null : textOf(`close ${id} as merged needs another open fact to merge into`);
};

const evidence: Check = (entry, ground) => {
    const quote = fieldText(entry, 'evidence');
    return quote.length <= EVIDENCE_CHARS && quotedIn(quote, ground.tail) ? null : textOf(`${fieldText(entry, 'op')} ${fieldText(entry, 'id')}: its evidence is not in the newest turns`);
};

function refusalOf(entry: Entry, ground: Ground): Text | null {
    const refused = [kind, open, reason].reduce<Text | null>((why, check) => why ?? check(entry, ground), null);
    return refused ?? (fieldText(entry, 'why') === 'merged' ? merge(entry, ground) : evidence(entry, ground));
}

function operationOf(entry: Entry): Reconciled | null {
    const id = fieldText(entry, 'id');
    if (fieldText(entry, 'op') === 'close') {
        const why = CLOSES.find((each) => each === fieldText(entry, 'why'));
        return why === undefined ? null : { op: 'close', id, why };
    }
    const text = clippedWords(entry, 'text', countOf(16));
    return text === null ? null : { op: 'update', id, text, why: clippedWords(entry, 'why', countOf(24)) };
}

function answerOf(raw: Text): readonly (Entry | null)[] | null {
    try {
        const parsed: unknown = JSON.parse(raw);
        const ops: unknown = isEntry(parsed) ? Reflect.get(parsed, 'ops') : undefined;
        const listed: readonly unknown[] = Array.isArray(ops) ? Array.from<unknown>(ops) : [];
        const entries: (Entry | null)[] = [];
        for (const one of listed) entries.push(isEntry(one) ? one : null);
        return entries;
    } catch { return null; }
}

function entryOf(entry: Entry | null, ground: Ground): Reconciled | Text {
    const why = entry === null ? textOf('not an operation') : refusalOf(entry, ground);
    const one = why === null && entry !== null ? operationOf(entry) : null;
    if (one === null || entry === null) {
        return why ?? textOf('an update needs a text');
    }
    ground.touched.add(one.id);
    if (one.op === 'close') ground.closed.add(one.id);
    if (one.op === 'close' && one.why === 'merged') ground.kept.add(fieldText(entry, 'into'));
    return one;
}

export function reconciliationOf(answer: Text, facts: ReadonlyMap<Text, Fact>, tail: Text): Reconciliation {
    const listed = answerOf(answer);
    if (listed === null) return { ops: [], refused: [textOf('the answer is not JSON')] };
    const ground: Ground = { facts, tail, touched: new Set(), closed: new Set(), kept: new Set() };
    const entries: (Reconciled | Text)[] = [];
    for (const entry of listed) entries.push(entryOf(entry, ground));
    return { ops: entries.filter((one) => typeof one !== 'string'), refused: entries.filter((one) => typeof one === 'string') };
}
