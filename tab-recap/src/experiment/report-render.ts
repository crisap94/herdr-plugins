import { must } from '#src/protocol/result.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import type { Kappa } from '#src/recap/domain/kappa.ts';
import type { Probability } from '#src/recap/domain/probability.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import type { Milliseconds } from '#src/recap/domain/time.ts';
import type { Usd } from '#src/recap/domain/usd.ts';
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
