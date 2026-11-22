import type { Text } from '#src/contract/kernel.ts';
import { brand } from '#src/recap/domain/brand.ts';
import { parseText } from '#src/recap/domain/text.ts';

export const STORY_WORDS = 120;

export const STORY_TOO_LONG = 'the paragraph is too long';

export type Story = Text;

export interface Merge {
    readonly id: Text;
    readonly into: Text;
}

export interface Curation {
    readonly merges: readonly Merge[];
    readonly story: Story | null;
    readonly refused: readonly Text[];
}

export interface Offer {
    readonly kind: Text;
    readonly shown: Text;
    readonly id: Text | null;
    readonly into: Text | null;
    readonly why: Text | null;
}

type Fields = Readonly<Record<string, unknown>>;

interface Merged {
    readonly ids: ReadonlySet<Text>;
    readonly targets: ReadonlySet<Text>;
}

const note = brand<string, 'Text'>;

const isObject = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);

export const parseStory = (raw: unknown): Story | null => {
    const words = typeof raw === 'string' ? raw.split(/\s+/u).filter((word) => word !== '') : [];
    const story = parseText(words.join(' '));
    return words.length === 0 || words.length > STORY_WORDS || story.kind === 'err' ? null : story.value;
};

export const parseOffer = (op: unknown): Offer | null => {
    if (!isObject(op)) {
        return null;
    }
    const [id, into, why] = [op['id'], op['into'], op['why']];
    return {
        kind: note(String(op['op'])),
        shown: note(String(id)),
        id: typeof id === 'string' ? note(id) : null,
        into: typeof into === 'string' ? note(into) : null,
        why: typeof why === 'string' ? note(why) : null,
    };
};

const closeRefusal = (offer: Offer, open: ReadonlySet<Text>, merged: Merged): Text | null => {
    const { id, into } = offer;
    if (offer.why !== 'merged' || into === null) {
        return note(`close ${offer.shown} must say why "merged" and the fact it merges into`);
    }
    if (id === null || !open.has(id) || merged.ids.has(id)) {
        return note(`${offer.shown} is not an open fact (or is already merged)`);
    }
    if (merged.targets.has(id)) {
        return note(`${id} is where another fact was merged: it stays open`);
    }
    return id === into || !open.has(into) || merged.ids.has(into) ? note(`${id} cannot merge into ${into}`) : null;
};

const refusal = (offer: Offer | null, open: ReadonlySet<Text>, merged: Merged): Text | null => {
    if (offer === null) {
        return note('not an operation');
    }
    return offer.kind === 'close' ? closeRefusal(offer, open, merged) : note(`${offer.kind} is not allowed: the curator may only close`);
};

const mergeOf = (offer: Offer | null): Merge | null => (offer === null || offer.id === null || offer.into === null ? null : { id: offer.id, into: offer.into });

const verdictOf = (offer: Offer | null, open: ReadonlySet<Text>, merged: Merged): Merge | Text => refusal(offer, open, merged) ?? mergeOf(offer) ?? note('not an operation');

const isMerge = (verdict: Merge | Text): verdict is Merge => typeof verdict === 'object';

export const curationOf = (answer: Text, open: ReadonlySet<Text>): Curation => {
    let parsed: unknown;
    try {
        parsed = JSON.parse(answer);
    } catch {
        return { merges: [], story: null, refused: [note('the answer is not JSON')] };
    }
    if (!isObject(parsed)) {
        return { merges: [], story: null, refused: [note('the answer is not an object')] };
    }
    const ops: readonly unknown[] = Array.isArray(parsed['ops']) ? parsed['ops'] : [];
    const merges: Merge[] = [];
    const refused: Text[] = [];
    for (const op of ops) {
        const verdict = verdictOf(parseOffer(op), open, { ids: new Set(merges.map((merge) => merge.id)), targets: new Set(merges.map((merge) => merge.into)) });
        if (isMerge(verdict)) {
            merges.push(verdict);
        } else {
            refused.push(verdict);
        }
    }
    const said = parsed['story'];
    const count = typeof said === 'string' ? said.trim().split(/\s+/u).length : 0;
    if (count > STORY_WORDS) {
        refused.push(note(`${STORY_TOO_LONG}: ${count} words, at most ${STORY_WORDS}`));
    }
    return { merges, story: parseStory(said), refused };
};
