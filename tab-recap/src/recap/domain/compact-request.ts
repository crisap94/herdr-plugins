// A compaction asked by another tool through a `compact-req-<tool>` token: `<id>` or `<id>:<note>`, and the answers tab-recap gives in `tab-recap-compact`.
// Pure. The id is the requester's; tab-recap acts on each id once.

export const REQUEST_PREFIX = 'compact-req-';
/** an id is the requester's: at most this many characters, so the answer fits in one token value */
export const ID_MAX = 16;
/** a herdr token value is cut to this many characters */
export const VALUE_MAX = 80;
/** an answer is kept an hour: progress is also an event, so a late reader only needs the last word */
export const ANSWER_TTL_MS = 3_600_000;

export interface Asked {
    /** the requester's id, as written (an empty or overlong one is not `valid`) */
    readonly id: string;
    readonly note: string | null;
    readonly valid: boolean;
}

/** `<id>` or `<id>:<note>`; null for an empty value. The note is everything after the first colon, cut to fit; an id is valid when it is 1 to 16 characters. */
export function askedOf(value: string): Asked | null {
    if (value === '') {
        return null;
    }
    const cut = value.indexOf(':');
    const id = cut < 0 ? value : value.slice(0, cut);
    const note = cut < 0 ? '' : value.slice(cut + 1);
    return { id, note: note.trim() === '' ? null : note.slice(0, VALUE_MAX - id.length - 1), valid: id !== '' && id.length <= ID_MAX };
}

/** The answer to a request whose id is empty or overlong: the first 16 characters of the id, and `failed-bad-id`. */
export const badIdAnswer = (id: string): string => answerValue(id.slice(0, ID_MAX), 'failed-bad-id');

/** A stage word as a token stage: lower case, dashes for anything else. */
const slug = (word: string): string => word.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';

/** The answer a compaction's end gives: `done`, or `failed-<reason>`. */
export const endAnswerOf = (stage: string, why: string | null): string => (stage === 'compacted' ? 'done' : `failed-${slug(why ?? stage)}`);

/** The answer a refusal gives before a compaction began. */
export const refusalAnswerOf = (why: string): string => `failed-${slug(why)}`;

/** `<id>:<stage>`, never longer than a herdr value. */
export const answerValue = (id: string, stage: string): string => `${id}:${stage}`.slice(0, VALUE_MAX);
