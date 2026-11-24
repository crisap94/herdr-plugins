import { must } from '@stateforge-labs/session-ledger';
import { parseCount, type Count } from '@stateforge-labs/session-ledger';
import type { Kappa } from '#src/recap/domain/kappa.ts';
import type { Probability } from '@stateforge-labs/session-ledger';
import { parseText, type Text } from '@stateforge-labs/session-ledger';
import type { Milliseconds } from '@stateforge-labs/session-ledger';
import type { Usd } from '@stateforge-labs/session-ledger';
import type { CountMean } from './stats.ts';


export type Metric = Count | Probability | Usd | Milliseconds | Kappa;

export type Cell = Metric | CountMean | Text | null;

const DIGITS = must(parseCount(3));

const numberText = (value: Metric, digits: Count): Text => must(parseText(Number.isInteger(value) ? String(value) : value.toFixed(digits)));

export function cellOf(value: Cell, digits: Count = DIGITS): Text {
    if (value === null) return must(parseText('n/a'));
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return numberText(value, digits);
    return value.over === 0 ? must(parseText('n/a')) : must(parseText(Number.isInteger(value.total / value.over) ? String(value.total / value.over) : (value.total / value.over).toFixed(digits)));
}

export function tableOf(header: readonly Text[], rows: readonly (readonly Cell[])[], digits: Count = DIGITS): Text {
    return must(parseText([`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`, ...rows.map((row) => `| ${row.map((value) => cellOf(value, digits)).join(' | ')} |`)].join('\n')));
}
