export const REQUEST_PREFIX = 'compact-req-';
export const ID_MAX = 16;
export const VALUE_MAX = 80;
export const ANSWER_TTL_MS = 3_600_000;

export interface Asked {
    readonly id: string;
    readonly note: string | null;
    readonly valid: boolean;
}

export function askedOf(value: string): Asked | null {
    if (value === '') {
        return null;
    }
    const cut = value.indexOf(':');
    const id = cut < 0 ? value : value.slice(0, cut);
    const note = cut < 0 ? '' : value.slice(cut + 1);
    return { id, note: note.trim() === '' ? null : note.slice(0, VALUE_MAX - id.length - 1), valid: id !== '' && id.length <= ID_MAX };
}

export const badIdAnswer = (id: string): string => answerValue(id.slice(0, ID_MAX), 'failed-bad-id');

const slug = (word: string): string => word.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';

export const endAnswerOf = (stage: string, why: string | null): string => (stage === 'compacted' ? 'done' : `failed-${slug(why ?? stage)}`);

export const refusalAnswerOf = (why: string): string => `failed-${slug(why)}`;

export const answerValue = (id: string, stage: string): string => `${id}:${stage}`.slice(0, VALUE_MAX);
