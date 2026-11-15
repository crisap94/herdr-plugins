import { appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runEval } from '../lib/cli.ts';
import { STATE_ROOT } from '../lib/env.ts';
import { writeQuestionOutputs } from './questions.ts';
import { NAME, SMOKE_ITEMS, loadItems, specOf } from './spec.ts';

function valueOf(argv: readonly string[], name: string): string | null {
    const index = argv.indexOf(name);
    if (index === -1) return null;
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`${name} needs a value`);
    return value;
}

export function argsOf(raw: readonly string[]): { readonly args: string[]; readonly smoke: boolean } {
    const smoke = raw.includes('--smoke');
    const resume = raw.includes('--resume');
    const args = raw.filter((arg) => arg !== '--smoke' && arg !== '--resume');
    const stub = args.includes('--stub');
    if (smoke) {
        if (args.includes('--items') || args.includes('--reps')) throw new Error('--smoke sets the items and repetitions itself; drop --items and --reps');
        args.push('--reps', '1');
        if (valueOf(args, '--label') === null && !stub) args.push('--label', 'smoke');
    }
    if (resume && !args.includes('--retry-failed')) args.push('--retry-failed');
    const label = valueOf(args, '--label') ?? (stub ? 'stub' : null);
    if (label === null) throw new Error('--label is required for a real run');
    const answers = join(valueOf(args, '--root') ?? STATE_ROOT, NAME, 'runs', label, 'answers.jsonl');
    if (resume && !existsSync(answers)) throw new Error(`--resume: no run to resume at ${answers}`);
    if (!resume && !stub && !args.includes('--report-only') && existsSync(answers)) throw new Error(`run ${label} already has answers at ${answers}; pass --resume to continue it, or choose another --label`);
    return { args, smoke };
}

try {
    const { args, smoke } = argsOf(process.argv.slice(2));
    const all = loadItems();
    const items = smoke ? all.filter((item) => SMOKE_ITEMS.includes(item.id)) : all;
    if (smoke && items.length !== SMOKE_ITEMS.length) throw new Error(`--smoke: dataset lacks one of ${SMOKE_ITEMS.join(', ')}`);
    const { dir, summary } = await runEval(specOf(items), args);
    const markdown = writeQuestionOutputs(dir, items.slice(0, summary.items), summary.configs.map((config) => config.name), summary.repetitions);
    appendFileSync(join(dir, 'report.md'), `\n${markdown}`);
    console.log(dir);
    process.exit(0);
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
}
