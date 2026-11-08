import { must } from '#src/protocol/result.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import { orElse } from '#src/recap/domain/gui-tab.ts';
import type { GuiCompactions, GuiSession } from '#src/recap/domain/gui-tab-parts.ts';
import type { SessionFacts } from '#src/recap/domain/session-facts.ts';
import { parseText } from '#src/recap/domain/text.ts';
import { instant } from '#src/recap/domain/time.ts';

const ZERO: Count = must(parseCount(0));

function compactionsOf(facts: SessionFacts): GuiCompactions | null {
    const found = facts.compactions;
    if (found === null) { return null; }
    return {
        count: orElse(parseCount(found.count), ZERO),
        byOrigin: { operator: orElse(parseCount(found.byOrigin.operator), ZERO), auto: orElse(parseCount(found.byOrigin.auto), ZERO) },
        measured: found.measured.map((pair) => ({ before: orElse(parseCount(pair.before), ZERO), after: orElse(parseCount(pair.after), ZERO) })),
    };
}

export function guiSessionOf(facts: SessionFacts): GuiSession {
    const { started, runs, autocompact, repo } = facts;
    return {
        started: started === null ? null : { at: instant(started.at), forMs: orElse(parseCount(started.forMs), ZERO) },
        runs: runs === null ? null : { total: orElse(parseCount(runs.total), ZERO), byCause: runs.byCause.map((entry) => ({ cause: entry.cause, count: orElse(parseCount(entry.count), ZERO) })) },
        compactions: compactionsOf(facts),
        chapters: orElse(parseCount(facts.chapters), null),
        agents: facts.agents.map((agent) => ({ label: must(parseText(agent.label)), share: orElse(parseCount(agent.share), ZERO), window: orElse(parseCount(agent.window), ZERO) })),
        repo: repo === null ? null : { name: must(parseText(repo.name)), branch: orElse(parseText(repo.branch), null) },
        files: facts.files.map((file) => ({ path: must(parseText(file.path)), count: orElse(parseCount(file.count), ZERO) })),
        autocompact: autocompact === null ? null : { decisions: orElse(parseCount(autocompact.decisions), ZERO), compacted: orElse(parseCount(autocompact.compacted), ZERO), waited: orElse(parseCount(autocompact.waited), ZERO) },
    };
}
