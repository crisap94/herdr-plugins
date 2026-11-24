import { err, ok, type Result } from '@stateforge-labs/session-ledger';
import type { Count } from '@stateforge-labs/session-ledger';
import { parseText, type Text } from '@stateforge-labs/session-ledger';
import { bornOf, type Born } from '#src/recap/domain/run-ids.ts';
import type { Instant } from '@stateforge-labs/session-ledger';
import type { ParseFailure } from '@stateforge-labs/session-ledger';

export interface ImportedChapterItem {
    readonly key: Text;
    readonly section: Text;
    readonly text: Text;
    readonly fact: Text;
    readonly born: Born;
    readonly anchor: Text | null;
}

export interface ImportedChapterRecord {
    readonly n: Count;
    readonly at: Instant;
    readonly items: readonly ImportedChapterItem[];
}

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
    return ok({ key: key.value, section: section.value, text: text.value, fact: fact.value, born: bornOf(born), anchor: anchor.value });
}
