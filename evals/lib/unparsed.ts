import { join } from 'node:path';
import { curationOf } from '../../tab-recap/src/recap/domain/curation.ts';
import { reconciliationOf } from '../../tab-recap/src/recap/domain/reconciliation.ts';
import { unfenced } from '../../tab-recap/src/adapters/job/prompts/recap-prompt.ts';
import { readJsonl } from './runner.ts';

export type Reader = 'today';

export type UnparsedEval = 'curator-reconcile' | 'curator-story';

const NOT_JSON = 'the answer is not JSON';
const NOT_OBJECT = 'the answer is not an object';

export function unparsedOf(evalName: UnparsedEval, text: string, reader: Reader): boolean {
    if (reader !== 'today') throw new Error(`unknown reader ${String(reader)}`);
    const body = unfenced(text);
    if (evalName === 'curator-reconcile') return reconciliationOf(body, new Map(), '').refused.includes(NOT_JSON);
    return curationOf(body, new Set()).refused.some((why) => why === NOT_JSON || why === NOT_OBJECT);
}

interface AnswerRow {
    readonly config?: unknown;
    readonly text?: unknown;
}

const EVALS: readonly UnparsedEval[] = ['curator-reconcile', 'curator-story'];

function argument(argv: readonly string[], name: string): string {
    const at = argv.indexOf(name);
    const value = at >= 0 ? argv[at + 1] : undefined;
    if (value === undefined || value.startsWith('--')) throw new Error(`${name} is required`);
    return value;
}

function main(argv: readonly string[]): void {
    const root = argument(argv, '--root');
    const label = argument(argv, '--label');
    for (const evalName of EVALS) {
        const rows = readJsonl<AnswerRow>(join(root, evalName, 'runs', label, 'answers.jsonl'));
        const configs = new Map<string, { total: number; unparsed: number; none: number }>();
        for (const row of rows) {
            const config = String(row.config);
            const count = configs.get(config) ?? { total: 0, unparsed: 0, none: 0 };
            count.total += 1;
            if (typeof row.text !== 'string') {
                count.none += 1;
            } else if (unparsedOf(evalName, row.text, 'today')) {
                count.unparsed += 1;
            }
            configs.set(config, count);
        }
        for (const [config, count] of configs) {
            console.log(`${evalName} ${config} today unparsed ${count.unparsed} of ${count.total}`);
            if (count.none > 0) console.log(`${evalName} ${config} no answer ${count.none}`);
        }
    }
}

if (import.meta.main) main(process.argv.slice(2));
