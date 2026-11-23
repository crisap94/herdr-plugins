import type { JudgeEntry } from '../../tab-recap/src/ports/run-inputs.ts';
import { textOf } from '../../packages/session-ledger/src/recap/domain/text.ts';

export interface DatasetRow {
    readonly key: string;
    readonly section: string;
    readonly text: string;
    readonly fact: string;
    readonly born: boolean;
    readonly anchor: string | null;
}

export const entryOf = (row: DatasetRow): JudgeEntry => ({
    key: textOf(row.key),
    section: textOf(row.section),
    text: textOf(row.text),
    birth: row.born ? 'born' : 'carried',
});
