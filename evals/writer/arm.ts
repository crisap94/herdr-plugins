import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCloseEvidence, type CloseEvidence } from '../../tab-recap/src/recap/domain/pipeline.ts';
import { flagOf } from '../lib/arm.ts';
import type { Answer } from '../lib/types.ts';
import type { WriterItem } from './prompt.ts';
import { outcomeOf } from './scoring.ts';

export function closeEvidenceFlag(argv: readonly string[]): CloseEvidence | null {
    const raw = flagOf(argv, '--close-evidence');
    if (raw === null) return null;
    const parsed = parseCloseEvidence(raw);
    if (parsed.kind === 'err') throw new Error('--close-evidence must be off or on');
    return parsed.value;
}

export interface WriterCounters {
    readonly config: string;
    readonly wrongful_closes: number;
    readonly correct_closes_kept: number;
    readonly g13_refusals: number;
}

// Counts the kept closes of the first answers, graded with the close-evidence setting `mode`.
export function writerCounters(items: readonly WriterItem[], answers: readonly Answer[], configs: readonly string[], mode: CloseEvidence): WriterCounters[] {
    const byId = new Map(items.map((item) => [item.id, item]));
    return configs.map((config) => {
        const counts = { config, wrongful_closes: 0, correct_closes_kept: 0, g13_refusals: 0 };
        for (const answer of answers) {
            const item = byId.get(answer.id);
            if (answer.config !== config || item === undefined || answer.text === null) continue;
            const outcome = outcomeOf(item, answer.text, mode);
            if (outcome.kind !== 'ops') continue;
            for (const op of outcome.kept) {
                if (op.op !== 'close') continue;
                if (item.expected.must_stay.includes(op.id)) counts.wrongful_closes += 1;
                if (item.expected.must_close.some((close) => close.id === op.id && op.why !== null && close.why.includes(op.why))) counts.correct_closes_kept += 1;
            }
            counts.g13_refusals += outcome.refused.filter((finding) => finding.gate === 'G13').length;
        }
        return counts;
    });
}

export function writerLine(off: WriterCounters, on: WriterCounters): string {
    const counters = (x: WriterCounters): string => `wrongful ${x.wrongful_closes} correct ${x.correct_closes_kept} g13 ${x.g13_refusals}`;
    return `${off.config} off ${counters(off)} on ${counters(on)}`;
}

export function writerArmMarkdown(block: { readonly mode: string; readonly configs: readonly WriterCounters[] }): string {
    const rows = block.configs.map((c) => `| ${c.config} | ${c.wrongful_closes} | ${c.correct_closes_kept} | ${c.g13_refusals} |`);
    return [
        '',
        `## writer: arm close evidence ${block.mode} (reported only)`,
        '',
        '- The correction round is not run: a close refused by G13 stays refused here, while the daemon would ask once more.',
        '- The gates match the daemon when the pipeline is not enumerate.',
        '',
        '| Configuration | Wrongful closes | Correct closes kept | G13 refusals |',
        '| --- | ---: | ---: | ---: |',
        ...rows,
        '',
    ].join('\n');
}

interface ArmedSummary {
    readonly items: number;
    readonly repetitions: number;
    readonly dataset_sha256: string;
    readonly arm?: { readonly mode: string; readonly configs: readonly WriterCounters[] };
}

function requiredFlag(argv: readonly string[], name: string): string {
    const value = flagOf(argv, name);
    if (value === null) throw new Error(`${name} is required`);
    return value;
}

function summaryOf(root: string, label: string): ArmedSummary {
    const file = join(root, 'writer', 'runs', label, 'summary.json');
    if (!existsSync(file)) throw new Error(`no run ${label} at ${file}`);
    return JSON.parse(readFileSync(file, 'utf8')) as ArmedSummary;
}

export function main(argv: readonly string[]): void {
    const root = requiredFlag(argv, '--root');
    const off = summaryOf(root, requiredFlag(argv, '--off'));
    const on = summaryOf(root, requiredFlag(argv, '--on'));
    const armOff = off.arm;
    const armOn = on.arm;
    if (armOff?.mode !== 'off') throw new Error(`run ${requiredFlag(argv, '--off')} is not arm off`);
    if (armOn?.mode !== 'on') throw new Error(`run ${requiredFlag(argv, '--on')} is not arm on`);
    if (off.items !== on.items || off.repetitions !== on.repetitions || off.dataset_sha256 !== on.dataset_sha256) throw new Error('the two runs differ in items, repetitions or dataset');
    for (const counters of armOff.configs) {
        const other = armOn.configs.find((each) => each.config === counters.config);
        if (other !== undefined) console.log(writerLine(counters, other));
    }
}

if (import.meta.main) main(process.argv.slice(2));
