import { readFileSync } from 'node:fs';
import { CURATOR_INSTRUCTIONS } from '../../tab-recap/src/adapters/job/prompts/curator-instructions.ts';
import { RUBRIC } from '../../tab-recap/src/adapters/job/prompts/rubric.ts';
import { curatorInput } from '../../packages/session-ledger/src/recap/application/curator-input.ts';
import type { CuratorMaterial } from '../../packages/session-ledger/src/recap/application/curator-input.ts';
import type { Item, Prompt } from '../lib/types.ts';

export interface MergePair {
    readonly ids: readonly [string, string];
    readonly kind: 'verbatim' | 'reworded';
    readonly keep: string | null;
}

export interface ClosedTempting {
    readonly id: string;
    readonly closed_why: string;
    readonly must_not_say: string;
    readonly current: string | null;
}

export interface Expected {
    readonly merge_pairs: readonly MergePair[];
    readonly no_merge: readonly (readonly [string, string])[];
    readonly waiting_on_operator: { readonly ids: readonly string[]; readonly gist: string } | null;
    readonly closed_ids: readonly ClosedTempting[];
    readonly names_and_numbers: readonly string[];
    readonly times: readonly string[];
}

export type Input = Omit<CuratorMaterial, 'rubric'>;

export type StoryItem = Item<Input, Expected>;

interface Row {
    readonly id: string;
    readonly plants: readonly string[];
    readonly input: Input;
    readonly expected: Expected;
}

export function loadItems(file: URL = new URL('./dataset.jsonl', import.meta.url)): StoryItem[] {
    const text = readFileSync(file, 'utf8');
    return text.split('\n').filter((line) => line.trim() !== '').map((line) => {
        const row = JSON.parse(line) as Row;
        return { id: row.id, plants: row.plants, input: row.input, expected: row.expected };
    });
}

export const built = (item: StoryItem): ReturnType<typeof curatorInput> => curatorInput({ ...item.input, rubric: RUBRIC.items });

export function openIds(item: StoryItem): ReadonlySet<string> {
    return new Set([...built(item).facts].filter(([, fact]) => fact.state === 'open').map(([id]) => id));
}

export const prompt = (item: StoryItem): Prompt => ({ system: CURATOR_INSTRUCTIONS, user: built(item).document });

export function judgeDocument(item: StoryItem): string {
    const document = built(item).document;
    const without = document.replace(/\n<rubric>[\s\S]*?<\/rubric>/, '');
    if (without === document) throw new Error(`${item.id}: the document has no <rubric> element to remove`);
    return without;
}
