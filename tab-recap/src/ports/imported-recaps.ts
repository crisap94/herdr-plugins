import { err, ok, type Result } from '#src/protocol/result.ts';
import type { Count } from '#src/recap/domain/count.ts';
import { parseText } from '#src/recap/domain/text.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import type { ParseFailure } from '@stateforge-labs/session-ledger/unstable/recap/domain/parse-failure.ts';
import type { RunItem } from './run-inputs.ts';

export interface ImportedChapterRecord {
    readonly n: Count;
    readonly at: Instant;
    readonly items: readonly RunItem[];
}

export type ImportedChapterItem = ImportedChapterRecord['items'][number];

type Row = Record<string, unknown>;

const isRow = (input: unknown): input is Row => typeof input === 'object' && input !== null;

export function parseImportedChapterItem(input: unknown): Result<ImportedChapterItem, ParseFailure> {
    if (!isRow(input)) return err({ kind: 'not-a-row' });
    const key = parseText(input.key);
    if (key.kind === 'err') return key;
    const section = parseText(input.section);
    if (section.kind === 'err') return section;
    const text = parseText(input.text);
    if (text.kind === 'err') return text;
    const fact = parseText(input.fact);
    if (fact.kind === 'err') return fact;
    const born = input.born;
    if (typeof born !== 'boolean') return err({ kind: 'not-a-row' });
    const anchor = input.anchor === null ? ok(null) : parseText(input.anchor);
    if (anchor.kind === 'err') return anchor;
    return ok({ key: key.value, section: section.value, text: text.value, fact: fact.value, born, anchor: anchor.value });
}
