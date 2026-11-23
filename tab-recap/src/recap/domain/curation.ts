import { parseText, textOf, type Text } from '@stateforge-labs/session-ledger/unstable/recap/domain/text.ts';
import { factIdOf, type FactId } from '@stateforge-labs/session-ledger/unstable/recap/domain/fact.ts';

export const STORY_WORDS = 120;

export const STORY_TOO_LONG = 'the paragraph is too long';

export type Story = Text;

export function parseStory(raw: unknown): Story | null {
    if (typeof raw !== 'string') {
        return null;
    }
    const words = raw.split(/\s+/u).filter((word) => word !== '');
    if (words.length === 0 || words.length > STORY_WORDS) {
        return null;
    }
    const story = parseText(words.join(' '));
    return story.kind === 'ok' ? story.value : null;
}

export const storyOf = parseStory;

export interface Merge {
    readonly id: FactId;
    readonly into: FactId;
}

export interface Curation {
    readonly merges: readonly Merge[];
    readonly story: Story | null;
    readonly refused: readonly Text[];
}

interface Merged {
    readonly ids: ReadonlySet<FactId>;
    readonly targets: ReadonlySet<FactId>;
}

type CloseReason = 'merged' | 'other';

type Operation =
    | { readonly kind: 'not-an-operation' }
    | { readonly kind: 'foreign'; readonly name: Text }
    | { readonly kind: 'close'; readonly shown: Text; readonly id: FactId | null; readonly into: FactId | null; readonly why: CloseReason };

const isObject = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === 'object' && value !== null && !Array.isArray(value);

const factIdIn = (raw: unknown): FactId | null => (typeof raw === 'string' ? factIdOf(raw) : null);

function parseOperation(op: unknown): Operation {
    if (!isObject(op)) {
        return { kind: 'not-an-operation' };
    }
    if (op['op'] !== 'close') {
        return { kind: 'foreign', name: textOf(String(op['op'])) };
    }
    return { kind: 'close', shown: textOf(String(op['id'])), id: factIdIn(op['id']), into: factIdIn(op['into']), why: op['why'] === 'merged' ? 'merged' : 'other' };
}

function closeRefusal(op: Operation & { readonly kind: 'close' }, open: ReadonlySet<FactId>, merged: Merged): Text | null {
    const { id, into } = op;
    if (op.why !== 'merged' || into === null) {
        return textOf(`close ${op.shown} must say why "merged" and the fact it merges into`);
    }
    if (id === null || !open.has(id) || merged.ids.has(id)) {
        return textOf(`${op.shown} is not an open fact (or is already merged)`);
    }
    if (merged.targets.has(id)) {
        return textOf(`${id} is where another fact was merged: it stays open`);
    }
    return id === into || !open.has(into) || merged.ids.has(into) ? textOf(`${id} cannot merge into ${into}`) : null;
}

function verdictOf(op: unknown, open: ReadonlySet<FactId>, merged: Merged): Merge | Text {
    const operation = parseOperation(op);
    if (operation.kind === 'not-an-operation') {
        return textOf('not an operation');
    }
    if (operation.kind === 'foreign') {
        return textOf(`${operation.name} is not allowed: the curator may only close`);
    }
    const refused = closeRefusal(operation, open, merged);
    if (refused !== null) {
        return refused;
    }
    return operation.id === null || operation.into === null ? textOf('not an operation') : { id: operation.id, into: operation.into };
}

export function curationOf(answer: Text, open: ReadonlySet<FactId>): Curation {
    let parsed: unknown;
    try {
        parsed = JSON.parse(answer);
    } catch {
        return { merges: [], story: null, refused: [textOf('the answer is not JSON')] };
    }
    if (!isObject(parsed)) {
        return { merges: [], story: null, refused: [textOf('the answer is not an object')] };
    }
    const ops: readonly unknown[] = Array.isArray(parsed['ops']) ? parsed['ops'] : [];
    const merges: Merge[] = [];
    const refused: Text[] = [];
    for (const op of ops) {
        const verdict = verdictOf(op, open, { ids: new Set(merges.map((merge) => merge.id)), targets: new Set(merges.map((merge) => merge.into)) });
        if (typeof verdict === 'string') {
            refused.push(verdict);
        } else {
            merges.push(verdict);
        }
    }
    const said = parsed['story'];
    const count = typeof said === 'string' ? said.trim().split(/\s+/u).length : 0;
    if (count > STORY_WORDS) {
        refused.push(textOf(`${STORY_TOO_LONG}: ${count} words, at most ${STORY_WORDS}`));
    }
    return { merges, story: storyOf(said), refused };
}
