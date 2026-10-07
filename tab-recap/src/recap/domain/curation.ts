// What the curator may answer, and what of it is accepted: closing a fact as merged into another, and one paragraph. Pure.
/** One fact closed as merged into another (document ids, as the curator answered them). */
export interface Merge {
    readonly id: string;
    readonly into: string;
}

/** The most words the paragraph may hold. */
export const STORY_WORDS = 120;

export interface Curation {
    /** the `close … merged` operations answered, in order */
    readonly merges: readonly Merge[];
    /** the paragraph, cut to STORY_WORDS; null when none was given */
    readonly story: string | null;
    /** each refused operation, said in a line for the log */
    readonly refused: readonly string[];
}

const NOTHING: Curation = { merges: [], story: null, refused: [] };

const isObject = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The paragraph on one line, at most STORY_WORDS words; a longer one is cut there and ends with `…`. */
export function storyOf(raw: unknown): string | null {
    if (typeof raw !== 'string') {
        return null;
    }
    const words = raw.split(/\s+/u).filter((word) => word !== '');
    if (words.length === 0) {
        return null;
    }
    return words.length <= STORY_WORDS ? words.join(' ') : `${words.slice(0, STORY_WORDS).join(' ')}…`;
}

interface Merged {
    readonly ids: ReadonlySet<string>;
    readonly targets: ReadonlySet<string>;
}

/** Why a `close` is refused, or null when it is a close as merged of an open fact into another that stays open. */
function closeRefusal(op: Readonly<Record<string, unknown>>, open: ReadonlySet<string>, merged: Merged): string | null {
    const [id, into] = [op['id'], op['into']];
    if (op['why'] !== 'merged' || typeof into !== 'string') {
        return `close ${String(id)} must say why "merged" and the fact it merges into`;
    }
    if (typeof id !== 'string' || !open.has(id) || merged.ids.has(id)) {
        return `${String(id)} is not an open fact (or is already merged)`;
    }
    if (merged.targets.has(id)) {
        return `${id} is where another fact was merged: it stays open`;
    }
    return id === into || !open.has(into) || merged.ids.has(into) ? `${id} cannot merge into ${into}` : null;
}

/** Why `op` is refused, or null when it is a `close … merged` of an open fact into another open fact. */
function refusal(op: unknown, open: ReadonlySet<string>, merged: Merged): string | null {
    if (!isObject(op)) {
        return 'not an operation';
    }
    return op['op'] === 'close' ? closeRefusal(op, open, merged) : `${String(op['op'])} is not allowed: the curator may only close`;
}

/**
 * The curator's answer: `{"ops":[…],"story":"…"}`. Only closes as merged are accepted, each of an open fact into another open
 * fact that stays open; the rest is refused and named. An answer that is not that JSON gives nothing.
 */
export function curationOf(answer: string, open: ReadonlySet<string>): Curation {
    let parsed: unknown;
    try {
        parsed = JSON.parse(answer);
    } catch {
        return { ...NOTHING, refused: ['the answer is not JSON'] };
    }
    if (!isObject(parsed)) {
        return { ...NOTHING, refused: ['the answer is not an object'] };
    }
    const ops: readonly unknown[] = Array.isArray(parsed['ops']) ? parsed['ops'] : [];
    const merges: Merge[] = [];
    const refused: string[] = [];
    for (const op of ops) {
        const why = refusal(op, open, { ids: new Set(merges.map((merge) => merge.id)), targets: new Set(merges.map((merge) => merge.into)) });
        if (why === null) {
            const { id, into } = op as { id: string; into: string };
            merges.push({ id, into });
        } else {
            refused.push(why);
        }
    }
    return { merges, story: storyOf(parsed['story']), refused };
}
