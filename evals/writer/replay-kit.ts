import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { unfencedText } from '../../tab-recap/src/adapters/job/prompts/recap-prompt.ts';
import { batch } from '../../packages/session-ledger/src/recap/application/job-kit/batch.ts';
import { parseAnswer } from '../../packages/session-ledger/src/recap/application/ops-answer.ts';
import { forTask, judge } from '../../packages/session-ledger/src/recap/application/ops-gating.ts';
import { LEDGER_GATES } from '../../packages/session-ledger/src/recap/domain/gates/ledger-gates.ts';
import { instant } from '../../packages/session-ledger/src/recap/domain/time.ts';
import { readJsonl, runDir } from '../lib/runner.ts';
import type { Answer } from '../lib/types.ts';
import { loadItems } from './prompt.ts';
import { groundOf } from './scoring.ts';
import { brand } from '../../packages/session-ledger/src/recap/domain/brand.ts';

const textOf = brand<string, 'Text'>;

// Replays every stored writer answer through the job-kit batch driver and
// through the direct judge, then compares kept, refused and gated byte for byte.
// Offline: no model call. Prints no answer text.

const NAME = 'writer';
const here = import.meta.dirname;

function argOf(name: string): string {
    const at = process.argv.indexOf(name);
    const value = at === -1 ? undefined : process.argv[at + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`usage: bun writer/replay-kit.ts --root <dir> --label <label>; missing ${name}`);
    return value;
}

interface Tally {
    answers: number;
    differ: number;
}

const FIELDS = ['kept', 'refused', 'gated'] as const;

const root = argOf('--root');
const label = argOf('--label');
const file = join(runDir(root, NAME, label), 'answers.jsonl');
if (!existsSync(file)) throw new Error(`${NAME}: no answers at ${file}`);

const dataset = (JSON.parse(readFileSync(join(here, 'config.json'), 'utf8')) as { dataset: string }).dataset;
const items = new Map(loadItems(join(here, dataset)).map((item) => [item.id, item]));

const tally = new Map<string, Tally>();
for (const row of readJsonl<Answer>(file)) {
    if (row.text === null) continue;
    const item = items.get(row.id);
    if (item === undefined) throw new Error(`${NAME}: answer ${row.id} has no item in ${dataset}`);
    const { resolving, ground } = groundOf(item.input);
    const parsed = parseAnswer(unfencedText(textOf(row.text)), resolving);
    if (parsed.kind !== 'ops') continue;
    const now = item.input.input.tab.now;
    const ops = forTask(parsed.ops, ground.key);
    const direct = judge(LEDGER_GATES, ops, ground, instant(now));
    const kit = batch('writer', { gates: LEDGER_GATES, task: ground, at: instant(now) }, ops);
    const differing = FIELDS.filter((field) => JSON.stringify(direct[field]) !== JSON.stringify(kit[field]));
    const counts = tally.get(row.config) ?? { answers: 0, differ: 0 };
    counts.answers += 1;
    if (differing.length > 0) {
        counts.differ += 1;
        console.log(`DIFF ${row.config} row ${row.id} rep ${row.repetition} task ${ground.key} fields ${differing.join(',')}`);
    }
    tally.set(row.config, counts);
}

for (const config of [...tally.keys()].sort()) {
    const counts = tally.get(config) ?? { answers: 0, differ: 0 };
    console.log(`${config} answers ${counts.answers} same ${counts.answers - counts.differ} differ ${counts.differ}`);
}

if ([...tally.values()].some((counts) => counts.differ > 0)) process.exitCode = 1;
