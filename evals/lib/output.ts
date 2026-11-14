import { writeFileSync } from 'node:fs';
import type { Mark } from './types.ts';
import type { Scored } from './summary.ts';

export function csvCell(value: string | number | null): string {
    if (value === null) return '';
    const text = String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const markCell = (mark: Mark | undefined): string => (mark === true ? '1' : mark === false ? '0' : '');

export function resultsCsv(scored: readonly Scored[], criteria: readonly string[]): string {
    const header = ['id', 'config', 'repetition', 'backend', 'model', 'effort', ...criteria, 'input_tokens', 'output_tokens', 'reasoning_tokens', 'cost_usd', 'latency_ms', 'attempts', 'failure_kind'];
    const sorted = [...scored].sort((a, b) => a.answer.id.localeCompare(b.answer.id) || a.answer.config.localeCompare(b.answer.config) || a.answer.repetition - b.answer.repetition);
    const rows = sorted.map((each) => [
        csvCell(each.answer.id),
        csvCell(each.answer.config),
        csvCell(each.answer.repetition),
        csvCell(each.answer.backend),
        csvCell(each.answer.model),
        csvCell(each.answer.effort),
        ...criteria.map((criterion) => markCell(each.marks[criterion])),
        csvCell(each.answer.input_tokens),
        csvCell(each.answer.output_tokens),
        csvCell(each.answer.reasoning_tokens),
        csvCell(each.answer.cost_usd),
        csvCell(each.answer.latency_ms),
        csvCell(each.answer.attempts),
        csvCell(each.failure_kind),
    ].join(','));
    return `${[header.join(','), ...rows].join('\n')}\n`;
}

export function writeText(path: string, text: string): void {
    writeFileSync(path, text);
}

export function writeJson(path: string, value: unknown): void {
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
