export function cell(value: number | string, digits = 3): string {
    if (typeof value === 'string') return value;
    if (Number.isNaN(value)) return 'n/a';
    return Number.isInteger(value) ? String(value) : value.toFixed(digits);
}

export function table(header: readonly string[], rows: readonly (readonly (number | string)[])[], digits = 3): string {
    return [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`, ...rows.map((row) => `| ${row.map((value) => cell(value, digits)).join(' | ')} |`)].join('\n');
}
