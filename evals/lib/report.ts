import { shown } from './stats.ts';
import type { ConfigSummary, CriterionSummary, RunSummary } from './types.ts';

const kindOf = (criterion: CriterionSummary): string => (criterion.kind === 'code' ? 'code' : criterion.validated === true ? 'judge, validated' : 'judge, not validated');

const usd = (value: number | null): string => (value === null ? 'n/a' : `$${value.toFixed(4)}`);

const ms = (value: number | null): string => (value === null ? 'n/a' : `${Math.round(value)}`);

const failures = (config: ConfigSummary): string => {
    const entries = Object.entries(config.failures);
    return entries.length === 0 ? '0' : entries.map(([kind, count]) => `${kind} ${count}`).join(', ');
};

export function report(summary: RunSummary): string {
    const lines: string[] = [];
    lines.push(`# ${summary.eval}: run ${summary.label}${summary.stub ? ' (stub, no model called)' : ''}`, '');
    lines.push('## Decision', '');
    for (const line of summary.decision) lines.push(`- ${line}`);
    lines.push('');
    lines.push('## Setup', '');
    lines.push(`- Items: ${summary.items}; repetitions: ${summary.repetitions}; shipped configuration: ${summary.shipped}.`);
    lines.push(`- Dataset sha256: ${summary.dataset_sha256}; prompt sha256: ${summary.prompt_sha256}.`);
    lines.push(`- ${summary.audit}`);
    if (summary.judge !== null) lines.push(`- Judge: ${summary.judge.model}, blind to the configuration, one pass or fail per criterion, burden of proof on passing; a pass without a verbatim quote is scored missing.`);
    lines.push(`- Written at ${summary.written_at}.`, '');
    lines.push('| Configuration | Backend | Model | Effort | Note |', '|---|---|---|---|---|');
    for (const config of summary.configs) {
        const notes = [config.shipped ? 'shipped' : '', config.graded_by_own_model && summary.judge !== null ? 'judged by its own model' : ''].filter((note) => note !== '').join('; ');
        lines.push(`| ${config.name} | ${config.backend} | ${config.model} | ${config.effort} | ${notes} |`);
    }
    lines.push('');
    lines.push('## Criteria per configuration', '');
    lines.push('Answers: k of n answers that pass, Wilson 95 % interval. Items: k of n items that pass in every repetition. Missing marks (a transport failure, a judge failure, or a judge pass without a verbatim quote) are outside n. An answer that does not parse fails every criterion and gets no judge call.', '');
    for (const criterion of summary.criteria) {
        lines.push(`### ${criterion.id} (${kindOf(criterion)})`, '');
        lines.push('| Configuration | Answers | Missing | Items, all repetitions | Flipping items |', '|---|---|---|---|---|');
        for (const config of summary.configs) {
            const stats = config.criteria[criterion.id];
            if (stats === undefined) continue;
            lines.push(`| ${config.name} | ${shown(stats.answers)} | ${stats.missing} | ${shown(stats.items)} | ${stats.flips.length === 0 ? '' : stats.flips.join(', ')} |`);
        }
        lines.push('');
    }
    lines.push(`## Paired against the shipped configuration (${summary.shipped})`, '');
    lines.push('Paired on items that pass in every repetition; exact McNemar on the discordant items.', '');
    lines.push('| Configuration | Criterion | Both pass | Only this one | Only shipped | Neither | p |', '|---|---|---|---|---|---|---|');
    for (const pair of summary.paired) lines.push(`| ${pair.config} | ${pair.criterion} | ${pair.both} | ${pair.only_config} | ${pair.only_versus} | ${pair.neither} | ${pair.p.toFixed(3)} |`);
    lines.push('');
    lines.push('## Suspect items', '');
    if (summary.suspects.length === 0) lines.push('No item fails a criterion in every configuration.');
    for (const suspect of summary.suspects) lines.push(`- ${suspect.criterion}: ${suspect.ids.join(', ')} fail in every configuration; check the expected answer first.`);
    lines.push('');
    lines.push('## Calls, tokens, cost, latency', '');
    lines.push('| Configuration | Answers | Calls | Failures | Anomalies | Input tokens | Output tokens | Reasoning tokens | Cost | Cost basis | Per 1,000 items | Median ms | p90 ms |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const config of summary.configs) lines.push(`| ${config.name} | ${config.answers} | ${config.calls} | ${failures(config)} | ${config.anomalies} | ${config.input_tokens} | ${config.output_tokens} | ${config.reasoning_tokens} | ${usd(config.cost_usd)} | ${config.cost_basis.join(', ')} | ${usd(config.cost_per_1000_items_usd)} | ${ms(config.latency_median_ms)} | ${ms(config.latency_p90_ms)} |`);
    lines.push('');
    lines.push('Cost is the Claude Agent SDK estimate (`total_cost_usd`); the Codex SDK reports no cost, so Codex cost is n/a.');
    if (summary.judge !== null) {
        const judge = summary.judge;
        const judgeFailures = Object.entries(judge.failures).map(([kind, count]) => `${kind} ${count}`).join(', ') || '0';
        lines.push('', `Judge: ${judge.answers_judged} answers judged in ${judge.calls} calls; failures ${judgeFailures}; ${judge.missing_marks} marks missing; ${judge.input_tokens} input and ${judge.output_tokens} output tokens; cost ${usd(judge.cost_usd)}.`);
    }
    lines.push('');
    lines.push('## What this run can show', '');
    for (const line of summary.can) lines.push(`- ${line}`);
    lines.push('', '## What this run cannot show', '');
    for (const line of summary.cannot) lines.push(`- ${line}`);
    lines.push('');
    return lines.join('\n');
}
