import { parseLine } from './jsonl.ts';
import { textOf } from '#src/recap/domain/text.ts';
import type { Row } from './jsonl.ts';

export const rowsOf = (lines: readonly string[]): readonly Row[] => lines.map((line) => parseLine(textOf(line))).filter((row): row is Row => row !== null);

export const count = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0);
