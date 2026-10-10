import { parse } from './jsonl.ts';
import type { Row } from './jsonl.ts';

export const rowsOf = (lines: readonly string[]): readonly Row[] => lines.map((line) => parse(line)).filter((row): row is Row => row !== null);

export const count = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0);
