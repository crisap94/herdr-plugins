import { readFileSync } from 'node:fs';
import { BRIEF_INSTRUCTIONS } from '../../tab-recap/src/adapters/job/prompts/brief-instructions.ts';
import { compactionInput, type CompactionMaterial } from '../../tab-recap/src/recap/application/compaction-input.ts';
import type { Item, Prompt } from '../lib/types.ts';
import { ownOf } from './checks.ts';

export interface Pointer {
    readonly index: number;
    readonly text: string;
    readonly section?: string;
    readonly why?: string | null;
}

export interface Bait {
    readonly about: string;
    readonly invented: readonly string[];
}

export interface Expected {
    readonly language: string;
    readonly session_language: string;
    readonly note: string | null;
    readonly goal: Pointer;
    readonly must_keep: readonly Pointer[];
    readonly reasons: readonly Pointer[];
    readonly waiting_on_operator: readonly Pointer[];
    readonly settled: readonly Pointer[];
    readonly must_not_reopen: readonly Pointer[];
    readonly planted: {
        readonly reasons: readonly Pointer[];
        readonly bait: readonly Bait[];
        readonly forbidden_not_in_own: readonly string[];
        readonly forbidden_in_own: readonly string[];
        readonly gate_conflict: boolean;
        readonly long_ledger: boolean;
    };
    readonly must_keep_characters: number;
    readonly blocking_outside_window: number;
    readonly allowed_tokens: readonly string[];
}

export type Input = CompactionMaterial;

export type BriefItem = Item<Input, Expected>;

export const SYSTEM: string = BRIEF_INSTRUCTIONS;

export const documentOf = (item: BriefItem): string => compactionInput(item.input);

export const ownText = (item: BriefItem): string => ownOf(item.input);

export function prompt(item: BriefItem): Prompt {
    return { system: SYSTEM, user: documentOf(item) };
}

export function loadItems(file: string): BriefItem[] {
    return readFileSync(file, 'utf8')
        .split('\n')
        .filter((line) => line.trim() !== '')
        .map((line) => {
            const row = JSON.parse(line) as BriefItem;
            return { id: row.id, plants: row.plants, input: row.input, expected: row.expected };
        });
}
