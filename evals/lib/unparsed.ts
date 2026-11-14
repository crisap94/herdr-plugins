import { join } from 'node:path';
import { curationOf } from '../../tab-recap/src/recap/domain/curation.ts';
import { reconciliationOf } from '../../tab-recap/src/recap/domain/reconciliation.ts';
import { parseText } from '../../tab-recap/src/recap/domain/text.ts';
import { answerTextOf } from '../../tab-recap/src/recap/application/recap-shape.ts';
import { unfenced } from '../../tab-recap/src/adapters/job/prompts/recap-prompt.ts';
import { readJsonl } from './runner.ts';

// 'today' parses the fence-stripped text as is. 'p0' first takes the JSON object
// out of surrounding prose, the way the P0 reader in the recap pipeline does.
export type Reader = 'today' | 'p0';

export const READERS: readonly Reader[] = ['today', 'p0'];

export type UnparsedEval = 'curator-reconcile' | 'curator-story';

const NOT_JSON = 'the answer is not JSON';
const NOT_OBJECT = 'the answer is not an object';

function bodyOf(text: string, reader: Reader): string {
    const body = unfenced(text);
    if (reader === 'today') return body;
    const read = parseText(body);
    return read.kind === 'ok' ? answerTextOf(read.value) : body;
}

export function unparsedOf(evalName: UnparsedEval, text: string, reader: Reader): boolean {
    if (!READERS.includes(reader)) throw new Error(`unknown reader ${String(reader)}`);
    const body = bodyOf(text, reader);
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
        const configs = new Map<string, { total: number; unparsed: Record<Reader, number>; none: number }>();
        for (const row of rows) {
            const config = String(row.config);
            const count = configs.get(config) ?? { total: 0, unparsed: { today: 0, p0: 0 }, none: 0 };
            count.total += 1;
            if (typeof row.text !== 'string') {
                count.none += 1;
            } else {
                for (const reader of READERS) {
                    if (unparsedOf(evalName, row.text, reader)) count.unparsed[reader] += 1;
                }
            }
            configs.set(config, count);
        }
        for (const [config, count] of configs) {
            for (const reader of READERS) {
                console.log(`${evalName} ${config} ${reader} unparsed ${count.unparsed[reader]} of ${count.total}`);
            }
            if (count.none > 0) console.log(`${evalName} ${config} no answer ${count.none}`);
        }
    }
}

if (import.meta.main) main(process.argv.slice(2));
