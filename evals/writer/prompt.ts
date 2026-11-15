import { readFileSync } from 'node:fs';
import { instructions } from '../../tab-recap/src/adapters/job/prompts/recap-instructions.ts';
import { TRANSCRIPT_BUDGET, writerContext } from '../../tab-recap/src/recap/application/writer-context.ts';
import type { RecapRequest } from '../../tab-recap/src/ports/summarizer.ts';
import type { CloseEvidence } from '../../tab-recap/src/recap/domain/pipeline.ts';
import type { Item, Prompt } from '../lib/types.ts';

export interface KeyFact {
    readonly k: string;
    readonly section: string;
    readonly accept_sections: readonly string[];
    readonly text: string;
    readonly why: string | null;
    readonly span: string;
    readonly why_span: string | null;
    readonly entry: number;
    readonly at: string;
    readonly via_update_of: string | null;
}

export interface Expected {
    readonly quiet: boolean;
    readonly key_facts: readonly KeyFact[];
    readonly already_in_ledger: readonly { readonly id: string; readonly span: string; readonly naive_add: string; readonly g2_refuses_naive_add: boolean }[];
    readonly must_close: readonly { readonly id: string; readonly section: string; readonly why: readonly string[]; readonly accept_update: boolean; readonly span: string }[];
    readonly must_stay: readonly string[];
    readonly must_rewrite: { readonly to: string; readonly ids: readonly string[] } | null;
    readonly one_goal: { readonly open_goal: string | null; readonly bait_span: string | null };
    readonly refuted: readonly { readonly claim: string; readonly span: string; readonly by_span: string }[];
    readonly not_established: readonly { readonly claim: string; readonly reason: string; readonly hidden_span: string | null }[];
    readonly optional: readonly { readonly text: string; readonly span: string; readonly sections: readonly string[] }[];
    readonly reference_ops: readonly Record<string, unknown>[];
    readonly reference_complete: boolean;
}

export type WriterItem = Item<RecapRequest, Expected>;

export const documentOf = (item: WriterItem): string => writerContext(item.input, TRANSCRIPT_BUDGET);

// With a close-evidence setting, the system is the one the daemon sends for it; without, it is unchanged.
export function prompt(item: WriterItem, closeEvidence?: CloseEvidence): Prompt {
    const system = closeEvidence === undefined ? instructions(item.input) : instructions({ ...item.input, closeEvidence });
    return { system, user: documentOf(item) };
}

export function transcriptOf(item: WriterItem): string {
    const document = documentOf(item);
    const at = document.indexOf('<transcript');
    if (at === -1) throw new Error(`${item.id}: the built document has no transcript`);
    return document.slice(at).replace(/\n<\/recap_input>\s*$/u, '');
}

export function loadItems(file: string): WriterItem[] {
    return readFileSync(file, 'utf8').split('\n').filter((line) => line.trim() !== '').map((line) => JSON.parse(line) as WriterItem);
}
