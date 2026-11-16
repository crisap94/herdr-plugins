import type { SessionRecap } from '@stateforge-labs/recap-view';
import type { SessionFacts } from '#src/recap/domain/session-facts.ts';

export function sessionRecapOf(facts: SessionFacts): SessionRecap {
    return {
        started: facts.started,
        runs: facts.runs,
        compactions: facts.compactions,
        agents: facts.agents,
        repo: facts.repo,
        files: facts.files,
        chapters: facts.chapters,
        autocompact: facts.autocompact,
    };
}
