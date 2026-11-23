import { type Result } from '#src/protocol/result.ts';
import { printReport, type Report } from './domain-report.ts';

const notCovered = (message: string): number => {
    console.error(`domain types: 3 — NOT COVERED: ${message}`);
    return 3;
};

export const runReport = (args: readonly string[], found: Result<Report, string>): number =>
    found.kind === 'err' ? notCovered(found.error) : printReport(found.value, args.includes('--json'), null);
