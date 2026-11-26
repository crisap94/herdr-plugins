import { readFileSync } from 'node:fs';
import { judgeInstructionsOf } from '../../tab-recap/src/adapters/job/prompts/judge-instructions.ts';
import { RUBRIC_TEXT } from '../../tab-recap/src/adapters/job/prompts/rubric.ts';
import { scoringDocument } from '../../tab-recap/src/recap/application/judge-context.ts';
import { writerContext } from '../../packages/session-ledger/src/recap/application/writer-context.ts';
import type { RecapRequest } from '../../packages/session-ledger/src/ports/summarizer.ts';
import { entryOf, type DatasetRow } from './row.ts';
import { requestOfStored, type StoredRecapRequest } from '../lib/stored-input.ts';
import type { Item, Prompt } from '../lib/types.ts';
import { textOf } from '../../packages/session-ledger/src/recap/domain/text.ts';
import type { Text } from '../../packages/session-ledger/src/recap/domain/text.ts';

export type CellMark = 'pass' | 'fail' | 'open';

export interface ExpectedItem {
    readonly key: string;
    readonly section: string;
    readonly breach: string | null;
    readonly checks: Readonly<Record<string, CellMark>>;
    readonly why: string;
    readonly support: string | null;
    readonly contradiction: string | null;
    readonly rewords: string | null;
    readonly absent: readonly string[];
}

export interface Input {
    readonly request: RecapRequest;
    readonly items: readonly DatasetRow[];
    readonly state: readonly DatasetRow[];
}

export interface Expected {
    readonly items: readonly ExpectedItem[];
}

export type JudgeItem = Item<Input, Expected>;

export type StoredJudgeItem = Item<Omit<Input, 'request'> & { readonly request: StoredRecapRequest }, Expected>;

export const CHECKS: readonly string[] = ['I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7', 'S'];

export const pooled = (check: string): string => (check.startsWith('S-') ? 'S' : check);

export const SYSTEM: string = judgeInstructionsOf('score', new Map());

export const writerInput = (item: JudgeItem): string => writerContext(item.input.request);

export const documentOf = (item: JudgeItem): string => scoringDocument({ rubric: RUBRIC_TEXT, input: textOf(writerInput(item)), items: item.input.items.map(entryOf), state: item.input.state.map(entryOf) });

export const sectionsOf = (item: JudgeItem): Map<Text, Text> => new Map(item.input.items.map((each) => [textOf(each.key), textOf(each.section)]));

export const carriersOf = (item: JudgeItem): Map<Text, Text> => new Map(item.input.state.map((each) => [textOf(each.key), textOf(each.section)]));

export function prompt(item: JudgeItem): Prompt {
    return { system: SYSTEM, user: documentOf(item) };
}

export function loadItems(file: string): JudgeItem[] {
    return readFileSync(file, 'utf8').split('\n').filter((line) => line.trim() !== '').map((line) => { const stored = JSON.parse(line) as StoredJudgeItem; return { ...stored, input: { ...stored.input, request: requestOfStored(stored.input.request) } }; });
}
