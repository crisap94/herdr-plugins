import type { Ledger } from '#src/ports/ledger.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import { brand } from '#src/recap/domain/brand.ts';
import { instant } from '#src/recap/domain/time.ts';
import type { Entry } from '#src/ports/transcripts.ts';
import { LEDGER_GATES } from '#src/recap/domain/gates/ledger-gates.ts';
import type { TaskShape } from '#src/recap/domain/grouping.ts';
import type { Ground } from './extract-job.ts';
import { anchorSource } from './anchor-source.ts';
import type { Built } from './recap-input.ts';

const REPEAT_WINDOW_MS = 24 * 3_600_000;

export interface GroundWorld {
    readonly tab: Text;
    readonly tasks: readonly TaskShape[];
    readonly built: Built;
    readonly entries: readonly Entry[];
    readonly ledger: Omit<Ledger, 'keysOf'>;
    readonly now: Instant;
    readonly language: Text;
}

export function groundOf(world: GroundWorld): Ground {
    const { tab, tasks, built, now } = world;
    const source = anchorSource(built.input);
    const agents = built.input.agents.flatMap((agent) => [agent.id, agent.label, agent.kind]).filter((name) => name !== '').map((name) => brand<string, 'Text'>(name.toLowerCase()));
    return {
        gates: LEDGER_GATES, now, facts: new Map(built.input.ledgers.flatMap((ledger) => ledger.facts.map((fact) => [brand<string, 'Text'>(fact.id), fact] as const))),
        resolving: {
            tasks: tasks.map((task) => brand<string, 'Text'>(task.id)), agents: built.input.agents, taskOf: built.numbering.taskOf,
            turns: world.entries.flatMap((entry) => (entry.at === undefined ? [] : [instant(entry.at)])), clock: { now, zone: brand<string, 'Text'>(built.input.tab.zone) },
        },
        grounds: tasks.map((task) => ({
            key: brand<string, 'Text'>(task.id), tab, shown: built.numbering.shown.get(brand<string, 'Text'>(task.id)) ?? new Map(),
            open: world.ledger.openOf({ tab, key: task.id }),
            closedLately: world.ledger.recentlyClosed({ tab, key: task.id }, now - REPEAT_WINDOW_MS), source, language: world.language, agents,
        })),
    };
}
