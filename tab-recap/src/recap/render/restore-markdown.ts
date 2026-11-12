import type { ByteBudget } from '#src/recap/domain/byte-budget.ts';
import type { RestoreBody } from '#src/recap/domain/restore-content.ts';
import type { FittedHandoff } from './handoff-budget.ts';
import { fitGroups } from './handoff-budget.ts';
import { groupLinesOf, omittedTotal } from './handoff-markdown.ts';
import { utcMinuteText } from './utc-minute.ts';

export function fitRestore(body: RestoreBody, budget: ByteBudget): FittedHandoff {
    const opening = `These are my notes on where my work stood, last brought up to date at ${utcMinuteText(body.lastRunAt)}. They can lag behind what happened after that: I check them against the worktree before I rely on them.`;
    return fitGroups(body, budget, (shown): FittedHandoff => {
        const left = omittedTotal(shown.omitted);
        const leftOut = left === 0 ? [] : ['', left === 1 ? '1 older note left out' : `${left} older notes left out`];
        return { kind: 'text', text: [opening, ...shown.groups.flatMap(groupLinesOf), ...leftOut].join('\n'), omitted: shown.omitted };
    });
}
