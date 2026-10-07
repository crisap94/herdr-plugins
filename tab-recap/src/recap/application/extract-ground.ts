// What an answer is understood and judged against, built from the document that was sent: the tasks, the ids, the turns' times, the ledger's
// recent closes (for the duplicate gate).
import type { Ledger } from '#src/ports/ledger.ts';
import type { Entry } from '#src/ports/transcripts.ts';
import { LEDGER_GATES } from '#src/recap/domain/gates/ledger-gates.ts';
import type { TaskShape } from '#src/recap/domain/grouping.ts';
import type { Ground } from './extract-job.ts';
import type { Built } from './recap-input.ts';

/** How far back a closed fact still counts as a repeat (gate G2). */
const REPEAT_WINDOW_MS = 24 * 3_600_000;

export function groundOf(world: { readonly tab: string; readonly tasks: readonly TaskShape[]; readonly built: Built; readonly entries: readonly Entry[]; readonly ledger: Ledger; readonly now: number; readonly language: string }): Ground {
    const { tab, tasks, built, now } = world;
    const agents = built.input.agents.flatMap((agent) => [agent.id, agent.label, agent.kind]).filter((name) => name !== '').map((name) => name.toLowerCase());
    return {
        gates: LEDGER_GATES, now,
        resolving: {
            tasks: tasks.map((task) => task.id), agents: built.input.agents, taskOf: built.numbering.taskOf,
            turns: world.entries.flatMap((entry) => (entry.at === undefined ? [] : [entry.at])), clock: { now, zone: built.input.tab.zone },
        },
        grounds: tasks.map((task) => ({
            key: task.id, tab, shown: built.numbering.shown.get(task.id) ?? new Map(),
            closedLately: world.ledger.recentlyClosed({ tab, key: task.id }, now - REPEAT_WINDOW_MS), language: world.language, agents,
        })),
    };
}
