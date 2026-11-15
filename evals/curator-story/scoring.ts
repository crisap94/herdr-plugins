import { unfenced } from '../../tab-recap/src/adapters/job/prompts/recap-prompt.ts';
import { curationOf, STORY_WORDS, storyOf } from '../../tab-recap/src/recap/domain/curation.ts';
import type { Curation, Merge } from '../../tab-recap/src/recap/domain/curation.ts';
import { languageOfLine } from '../../tab-recap/src/recap/domain/gates/language.ts';
import { unparsed } from '../lib/scoring.ts';
import type { Graded, Mark } from '../lib/types.ts';
import { openIds } from './prompt.ts';
import type { StoryItem } from './prompt.ts';
import { outsideOf } from './tokens.ts';

export const CODE_CRITERIA = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10', 'S11'] as const;

const NOT_PARSED: readonly string[] = ['the answer is not JSON', 'the answer is not an object'];

export interface Read {
    readonly curation: Curation;
    readonly story: string | null;
}

export function readAnswer(item: StoryItem, text: string): Read | null {
    const body = unfenced(text);
    const curation = curationOf(body, openIds(item));
    if (curation.refused.some((why) => NOT_PARSED.includes(why))) return null;
    const raw = (JSON.parse(body) as Readonly<Record<string, unknown>>)['story'];
    return { curation, story: typeof raw === 'string' && storyOf(raw) !== null ? raw : null };
}

export const wordsOf = (story: string): string[] => story.split(/\s+/u).filter((word) => word !== '');

export const breaksProse = (story: string): boolean => /[\r\n]/.test(story) || /(^|[\r\n])[ \t]*(- |\* |#|\d+\. )/u.test(story);

export function languageMark(story: string, language: string): Mark {
    let en = 0;
    let es = 0;
    for (const sentence of story.split(/(?<=[.!?])\s+/u)) {
        const verdict = languageOfLine(sentence);
        if (verdict === 'en') en += 1;
        if (verdict === 'es') es += 1;
    }
    if (en + es === 0) return null;
    return language === 'es' ? es > en : en > es;
}

export const joins = (merge: Merge, first: string, second: string): boolean => (merge.id === first && merge.into === second) || (merge.id === second && merge.into === first);

export function copyClasses(pairs: StoryItem['expected']['merge_pairs']): (id: string) => string {
    const parent = new Map<string, string>();
    const root = (id: string): string => {
        const up = parent.get(id);
        return up === undefined || up === id ? id : root(up);
    };
    for (const pair of pairs) {
        if (pair.kind !== 'verbatim') continue;
        const [first, second] = [root(pair.ids[0]), root(pair.ids[1])];
        if (first !== second) parent.set(second, first);
    }
    return root;
}

export const outsideTokens = (item: StoryItem, story: string): string[] => outsideOf({ names: item.expected.names_and_numbers, times: item.expected.times, facts: item.input.facts.length }, story);

export function grade(item: StoryItem, text: string): Graded {
    const read = readAnswer(item, text);
    if (read === null) return unparsed(CODE_CRITERIA);
    const { curation, story } = read;
    const { merges } = curation;
    const pairs = item.expected.merge_pairs;
    const nearPairs = item.expected.no_merge;
    const classOf = copyClasses(pairs);
    const links = (merge: Merge, first: string, second: string): boolean => joins({ id: classOf(merge.id), into: classOf(merge.into) }, classOf(first), classOf(second));
    const merged = (first: string, second: string): boolean => merges.some((merge) => joins(merge, first, second));
    const pairMerged = (first: string, second: string): boolean => merges.some((merge) => links(merge, first, second));
    const rewordedMerged = pairs.filter((pair) => pair.kind === 'reworded' && pairMerged(pair.ids[0], pair.ids[1]));
    const marks: Record<string, Mark> = {
        S1: true,
        S2: story !== null,
        S3: story === null ? null : wordsOf(story).length <= STORY_WORDS,
        S4: story === null ? null : !breaksProse(story),
        S5: story === null ? null : languageMark(story, item.input.language),
        S6: curation.refused.length === 0,
        S7: pairs.length === 0 ? null : pairs.every((pair) => pairMerged(pair.ids[0], pair.ids[1])),
        S8: rewordedMerged.length === 0 ? null : rewordedMerged.every((pair) => !merges.some((merge) => pair.keep !== null && classOf(merge.id) === classOf(pair.keep) && links(merge, pair.ids[0], pair.ids[1]))),
        S9: nearPairs.length === 0 ? null : !nearPairs.some(([first, second]) => merged(first, second)),
        S10: merges.every((merge) => pairs.some((pair) => links(merge, pair.ids[0], pair.ids[1]))),
        S11: story === null ? null : outsideTokens(item, story).length === 0,
    };
    return { parsed: true, marks };
}
