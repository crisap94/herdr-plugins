import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { answerTextOf } from '../../tab-recap/src/recap/application/recap-shape.ts';
import { parseRepairMode, type RepairMode } from '../../tab-recap/src/recap/application/job-kit/repair.ts';
import { parseText } from '../../tab-recap/src/recap/domain/text.ts';
import { readJsonl } from './runner.ts';
import { writeJson } from './output.ts';

export type ArmEval = 'curator-reconcile' | 'curator-story';

const ARM_EVALS: readonly ArmEval[] = ['curator-reconcile', 'curator-story'];

export interface ArmCounters {
    readonly config: string;
    readonly wrongful_closes: number;
    readonly applied_ops: number;
    readonly unparsed: number;
    readonly refused_ops: number;
    readonly repair_calls: number;
    readonly repair_input_tokens: number;
    readonly repair_output_tokens: number;
    readonly tokens_measured: boolean;
}

export interface ArmBlock {
    readonly mode: string;
    readonly configs: readonly unknown[];
}

interface ArmFile {
    readonly flag: string;
    readonly mode: string;
}

interface ArmSummary {
    readonly items: number;
    readonly repetitions: number;
    readonly dataset_sha256: string;
    readonly arm?: ArmBlock;
}

export function flagOf(argv: readonly string[], name: string): string | null {
    const at = argv.indexOf(name);
    if (at === -1) return null;
    const value = argv[at + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`${name} needs a value`);
    return value;
}

export function repairFlag(argv: readonly string[]): RepairMode | null {
    const raw = flagOf(argv, '--repair');
    if (raw === null) return null;
    const parsed = parseRepairMode(raw);
    if (parsed.kind === 'err') throw new Error('--repair must be off or once');
    return parsed.value;
}

// The text the daemon reads: the answer inside a JSON envelope when there is one.
export function plainOf(text: string): string {
    const read = parseText(text);
    return read.kind === 'ok' ? answerTextOf(read.value) : text;
}

export function guardMode(dir: string, flag: string, mode: string | null): void {
    const file = join(dir, 'arm.json');
    const stored = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as ArmFile) : null;
    if (mode === null) {
        if (stored !== null) throw new Error(`this run was made with ${stored.flag} ${stored.mode}: pass the same flag`);
        return;
    }
    if (stored !== null && stored.mode !== mode) throw new Error('this run holds answers of another arm');
    if (stored === null && readJsonl(join(dir, 'answers.jsonl')).length > 0) throw new Error('this run holds answers of another arm');
    writeJson(file, { flag, mode });
}

export function writeArm(dir: string, block: ArmBlock, markdown: string): void {
    const file = join(dir, 'summary.json');
    const summary = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    writeJson(file, { ...summary, arm: block });
    appendFileSync(join(dir, 'report.md'), markdown);
}

const tokensOf = (counters: ArmCounters): string => (counters.tokens_measured ? `${counters.repair_input_tokens}/${counters.repair_output_tokens}` : 'unmeasured');

export function armMarkdown(evalName: string, block: { readonly mode: string; readonly configs: readonly ArmCounters[] }): string {
    const rows = block.configs.map((c) => `| ${c.config} | ${c.wrongful_closes} | ${c.applied_ops} | ${c.unparsed} | ${c.refused_ops} | ${c.repair_calls} | ${tokensOf(c)} |`);
    return [
        '',
        `## ${evalName}: arm repair ${block.mode} (reported only)`,
        '',
        '| Configuration | Wrongful closes | Applied ops | Unparsed | Refused ops | Repair calls | Repair tokens in/out |',
        '| --- | ---: | ---: | ---: | ---: | ---: | --- |',
        ...rows,
        '',
    ].join('\n');
}

export function armLine(evalName: string, a: ArmCounters, c: ArmCounters): string {
    const counters = (x: ArmCounters): string => `wrongful ${x.wrongful_closes} applied ${x.applied_ops} unparsed ${x.unparsed} refused ${x.refused_ops}`;
    return `${evalName} ${a.config} A ${counters(a)} C ${counters(c)} repair calls ${c.repair_calls} tokens ${tokensOf(c)}`;
}

function requiredFlag(argv: readonly string[], name: string): string {
    const value = flagOf(argv, name);
    if (value === null) throw new Error(`${name} is required`);
    return value;
}

function summaryOf(root: string, evalName: string, label: string): ArmSummary | null {
    const file = join(root, evalName, 'runs', label, 'summary.json');
    if (!existsSync(file)) return null;
    return JSON.parse(readFileSync(file, 'utf8')) as ArmSummary;
}

export function pairedConfigs<T extends { readonly config: string }>(first: readonly T[], second: readonly T[], what: string): Array<readonly [T, T]> {
    const names = (configs: readonly T[]): string => configs.map((each) => each.config).sort().join(', ');
    if (names(first) !== names(second)) throw new Error(`${what}: the two runs differ in configurations: ${names(first)} against ${names(second)}`);
    return first.map((each) => [each, second.find((other) => other.config === each.config) as T] as const);
}

export function main(argv: readonly string[]): void {
    const root = requiredFlag(argv, '--root');
    const labelA = requiredFlag(argv, '--a');
    const labelC = requiredFlag(argv, '--c');
    for (const evalName of ARM_EVALS) {
        const a = summaryOf(root, evalName, labelA);
        const c = summaryOf(root, evalName, labelC);
        if (a === null || c === null) continue;
        if (a.arm?.mode !== 'off') throw new Error(`${evalName}: run ${labelA} is not arm off`);
        if (c.arm?.mode !== 'once') throw new Error(`${evalName}: run ${labelC} is not arm once`);
        if (a.items !== c.items || a.repetitions !== c.repetitions || a.dataset_sha256 !== c.dataset_sha256) throw new Error(`${evalName}: A and C differ in items, repetitions or dataset`);
        for (const [counters, other] of pairedConfigs(a.arm.configs as readonly ArmCounters[], c.arm.configs as readonly ArmCounters[], evalName)) console.log(armLine(evalName, counters, other));
    }
}

if (import.meta.main) main(process.argv.slice(2));
