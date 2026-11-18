import type { Ledger } from '#src/ports/ledger.ts';
import type { Entry } from '#src/ports/transcripts.ts';
import { LEDGER_GATES } from '#src/recap/domain/gates/ledger-gates.ts';
import type { TaskShape } from '#src/recap/domain/grouping.ts';
import type { Ground } from './extract-job.ts';
import { anchorSource } from './anchor-source.ts';
import type { Built } from './recap-input.ts';

const REPEAT_WINDOW_MS = 24 * 3_600_000;

export function groundOf(world: { readonly tab: string; readonly tasks: readonly TaskShape[]; readonly built: Built; readonly entries: readonly Entry[]; readonly ledger: Ledger; readonly now: number; readonly language: string }): Ground {
    const { tab, tasks, built, now } = world;
    const source = anchorSource(built.input);
    const agents = built.input.agents.flatMap((agent) => [agent.id, agent.label, agent.kind]).filter((name) => name !== '').map((name) => name.toLowerCase());
    return {
        gates: LEDGER_GATES, now, facts: new Map(built.input.ledgers.flatMap((ledger) => ledger.facts.map((fact) => [fact.id, fact] as const))),
        resolving: {
            tasks: tasks.map((task) => task.id), agents: built.input.agents, taskOf: built.numbering.taskOf,
            turns: world.entries.flatMap((entry) => (entry.at === undefined ? [] : [entry.at])), clock: { now, zone: built.input.tab.zone },
        },
        grounds: tasks.map((task) => ({
            key: task.id, tab, shown: built.numbering.shown.get(task.id) ?? new Map(),
            open: world.ledger.openOf({ tab, key: task.id }),
            closedLately: world.ledger.recentlyClosed({ tab, key: task.id }, now - REPEAT_WINDOW_MS), source, language: world.language, agents,
        })),
    };
}
