// Checks a Part B dataset before run-b.ts judges it. Prints OK or the problems, exits 1 on any problem.
//
// Usage: bun evals/judge-agreement/check-b.ts [dataset.jsonl]   (default: dataset-b.sample.jsonl beside this file)

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSiblings, type Expect, type Row } from './b-evals.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const EVALS = resolve(HERE, '..');
const EXPECTS: readonly Expect[] = ['fail', 'pass', 'open'];

function problemsOf(file: string): string[] {
    const problems: string[] = [];
    if (!existsSync(file)) return [`dataset not found: ${file}`];
    const siblings = loadSiblings(EVALS);
    const lines = readFileSync(file, 'utf8').split('\n').filter((line) => line.trim() !== '');
    if (lines.length === 0) problems.push('dataset has no rows');
    const seen = new Set<string>();
    lines.forEach((line, index) => {
        const where = `line ${index + 1}`;
        let row: Row;
        try {
            row = JSON.parse(line) as Row;
        } catch {
            problems.push(`${where}: not JSON`);
            return;
        }
        if (typeof row.id !== 'string' || row.id === '') problems.push(`${where}: id must be a non-empty string`);
        else if (seen.has(row.id)) problems.push(`${where}: duplicate id ${row.id}`);
        else seen.add(row.id);
        const sibling = siblings.get(row.eval);
        if (sibling === undefined) {
            problems.push(`${where} (${row.id}): unknown eval ${JSON.stringify(row.eval)}`);
            return;
        }
        const item = sibling.items.get(row.source);
        if (item === undefined) problems.push(`${where} (${row.id}): no ${row.eval} item ${JSON.stringify(row.source)}`);
        if (typeof row.answer !== 'string') problems.push(`${where} (${row.id}): answer must be a string`);
        if (row.breach !== null && typeof row.breach !== 'string') problems.push(`${where} (${row.id}): breach must be null or a string`);
        if (typeof row.evidence !== 'string') problems.push(`${where} (${row.id}): evidence must be a string`);
        if (row.expected === null || typeof row.expected !== 'object') {
            problems.push(`${where} (${row.id}): expected must be an object`);
            return;
        }
        for (const key of Object.keys(row.expected)) {
            if (!sibling.criteria.some((criterion) => criterion.id === key)) problems.push(`${where} (${row.id}): ${key} is not a ${row.eval} criterion`);
        }
        for (const criterion of sibling.criteria) {
            const value = row.expected[criterion.id];
            if (value === undefined) problems.push(`${where} (${row.id}): no expectation for ${criterion.id}`);
            else if (!EXPECTS.includes(value)) problems.push(`${where} (${row.id}): ${criterion.id} must be fail, pass or open, got ${JSON.stringify(value)}`);
        }
        if (item === undefined || typeof row.answer !== 'string') return;
        const judgeable = sibling.judge(item, row.answer);
        const scored = Object.values(row.expected).some((value) => value === 'fail' || value === 'pass');
        if (!judgeable.ok) {
            if (scored) problems.push(`${where} (${row.id}): answer does not parse but has fail or pass expectations`);
        } else {
            const applies = sibling.applies(item, row.answer);
            for (const [key, value] of Object.entries(row.expected)) {
                if ((value === 'fail' || value === 'pass') && !applies.has(key)) problems.push(`${where} (${row.id}): ${key} does not apply to this answer but has a ${value} expectation`);
            }
        }
        const planted = Object.values(row.expected).includes('fail');
        if (row.breach !== null && !planted) problems.push(`${where} (${row.id}): breach ${row.breach} has no fail expectation`);
        if (row.breach === null && planted) problems.push(`${where} (${row.id}): fail expectation without a breach`);
    });
    return problems;
}

const file = resolve(process.argv[2] ?? join(HERE, 'dataset-b.sample.jsonl'));
const problems = problemsOf(file);
if (problems.length === 0) {
    console.log('OK');
} else {
    for (const problem of problems) console.log(problem);
    process.exit(1);
}
