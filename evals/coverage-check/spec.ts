import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LADDER, ladder } from '../lib/ladder.ts';
import { sha256 } from '../lib/runner.ts';
import type { Config, EvalSpec } from '../lib/types.ts';
import { JUDGE } from './judge-criteria.ts';
import { prompt } from './prompt.ts';
import type { CoverageItem, Expected, Input } from './prompt.ts';
import { CODE_CRITERIA, grade, stub } from './scoring.ts';

export const NAME = 'coverage-check';
export const DATASET_SHA256 = '7f1952ec174e128f944c55a884527e0a4e843c1e3330f07acc1b73960280da2a';
export const TIMEOUT_MS = 180000;
export const SMOKE_ITEMS: readonly string[] = ['cc-01-literal-small-orchard', 'cc-21-one-blocking-absent-medium-tidewater'];

const DATASET = join(dirname(fileURLToPath(import.meta.url)), 'dataset.jsonl');

export function loadItems(): CoverageItem[] {
    const raw = readFileSync(DATASET, 'utf8');
    const digest = sha256(raw);
    if (digest !== DATASET_SHA256) throw new Error(`${DATASET}: sha256 ${digest}, expected ${DATASET_SHA256}; rebuild and check the dataset, then update DATASET_SHA256 and SPEC.md`);
    return raw.split('\n').filter((line) => line.trim() !== '').map((line) => JSON.parse(line) as CoverageItem);
}

export const SHIPPED: Config = { name: 'claude-haiku-low', backend: 'claude', model: 'claude-haiku-5-5', effort: 'low' };

export const CONFIGS: readonly Config[] = ladder(SHIPPED, LADDER.filter((config) => config.name !== 'claude-sonnet-high')).map((config) => ({ ...config, timeoutMs: TIMEOUT_MS }));

export const CAN: readonly string[] = [
    'Which configurations pass a brief that dropped a blocking fact (C8a, the costly error) or block a brief that kept everything (C8b).',
    'Per configuration, the trade between catching dropped facts (C5) and finding kept ones (C4) at marks 0.60, 0.70 and 0.75, and the AUC of the probability against the expected side.',
    'Whether an answer stays on the same side of the mark over 3 repetitions (C7, from questions.csv).',
];

export const CANNOT: readonly string[] = [
    'Whether paraphrases written by one model are as easy or as hard to recognise as a real brief\'s.',
    'That the near-miss classes (vague, detail-changed, 15 questions) and the 8 dropped reasons are right: they rest on a model\'s judgment of what "the detail needed to act on it" is.',
    'Much about the small classes: C5n has 6 items, C6d has 4, C8b has 9.',
    'Anything about Jev, the backend production prefers for this check when a Jev key is set.',
    'Anything about briefs in another language than English, or briefs over 3,000 characters.',
    'Question-level intervals that mean what they say: the 444 questions sit in 24 briefs and 122 distinct facts, many reused across items.',
    'That claude-haiku-low is what production ran: the plugin calls the claude command line with the alias haiku, the eval calls the Agent SDK with claude-haiku-5-5.',
];

export function specOf(items: readonly CoverageItem[]): EvalSpec<Input, Expected> {
    return {
        name: NAME,
        items,
        configs: CONFIGS,
        repetitions: 3,
        codeCriteria: CODE_CRITERIA,
        judge: JUDGE,
        prompt,
        grade,
        stub,
        notes: { can: CAN, cannot: CANNOT },
    };
}
