import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ok, type Result } from '#src/protocol/result.ts';
import { guard, parseBaseline } from './domain-baseline.ts';
import type { Counts } from './domain-findings.ts';

const git = (args: readonly string[]): string => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

const countsOfTexts = (texts: readonly string[]): Result<Counts, string> => {
    const merged: Record<string, Counts[string]> = {};
    for (const text of texts) {
        const parsed = parseBaseline(JSON.parse(text));
        if (parsed.kind === 'err') {
            return parsed;
        }
        Object.assign(merged, parsed.value);
    }
    return ok(merged);
};

const baseTexts = (dir: string, base: string): readonly string[] =>
    git(['ls-tree', '--name-only', base, `${dir}/`])
        .split('\n')
        .filter((line) => line.endsWith('.json'))
        .map((path) => git(['show', `${base}:./${path.slice(path.indexOf(dir))}`]));

const compare = (dir: string, before: readonly string[]): Result<readonly string[], string> => {
    const was = countsOfTexts(before);
    const now = countsOfTexts(readdirSync(dir).filter((name) => name.endsWith('.json')).map((name) => readFileSync(join(dir, name), 'utf8')));
    if (was.kind === 'err') {
        return was;
    }
    return now.kind === 'err' ? now : ok(guard(was.value, now.value));
};

const main = (args: readonly string[]): number => {
    const [dir, base] = args;
    if (dir === undefined || base === undefined) {
        console.error('domain baseline: 3 — NOT COVERED: usage: node bin/check-domain-baseline.ts <baseline dir> <merge base>');
        return 3;
    }
    try {
        const before = baseTexts(dir, base);
        if (before.length === 0) {
            console.log(`domain baseline: ${dir} is not at the merge base: this change introduces it`);
            return 0;
        }
        const problems = compare(dir, before);
        if (problems.kind === 'err') {
            console.error(`domain baseline: 3 — NOT COVERED: ${problems.error}`);
            return 3;
        }
        problems.value.forEach((line) => console.error(`  ${line}`));
        console.log(problems.value.length === 0 ? 'domain baseline: no entry rose and none is new' : `domain baseline: 1 — ${problems.value.length} entry(ies) rose or are new: fix the code instead`);
        return problems.value.length === 0 ? 0 : 1;
    } catch (error) {
        console.error(`domain baseline: 3 — NOT COVERED: ${String(error)}`);
        return 3;
    }
};

if (import.meta.main) {
    process.exitCode = main(process.argv.slice(2));
}
