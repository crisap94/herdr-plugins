import type { Agents } from '#src/ports/agents.ts';
import type { TranscriptRegistry } from '#src/ports/transcript-registry.ts';
import { isUnknown } from '#src/ports/unknowable.ts';
import { sessionId } from '#src/recap/domain/ids.ts';
import type { HandoffOutcome } from '#src/recap/domain/handoff-outcome.ts';
import type { HandoffEvidence } from '#src/recap/domain/handoff-plan.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import { collapsedText } from '#src/recap/domain/text-collapse.ts';
import type { CurrentSession } from './lane-recent.ts';
import type { Ready } from './handoff-target.ts';
import { HANDOFF_OBSERVATIONS, HANDOFF_OBSERVE_MS, HANDOFF_PREFIX_CODE_POINTS, HANDOFF_PROMPT_TAIL_BYTES } from './handoff-limits.ts';

export type Before = { readonly kind: 'prompt'; readonly text: string | null } | { readonly kind: 'none' };

export interface Baseline {
    readonly lane: Lane;
    readonly before: Before;
}

interface Evidence {
    readonly transcript: { readonly before: string | null } | null;
    readonly status: boolean;
}

interface Observed {
    readonly lane: Lane;
    readonly confirmed: boolean;
}

type Latest = { readonly kind: 'prompt'; readonly text: string | null } | { readonly kind: 'unreadable' };

export interface ConfirmationDeps {
    readonly agents: Pick<Agents, 'status'>;
    readonly transcripts: TranscriptRegistry;
    readonly session: CurrentSession;
    readonly pause: (ms: number) => Promise<void>;
}

const prefixOf = (text: string): string => collapsedText(Array.from(text).slice(0, HANDOFF_PREFIX_CODE_POINTS).join(''), 'space');

function evidenceOf(plan: HandoffEvidence, before: Before): Evidence {
    if (before.kind === 'none') {
        return { transcript: null, status: true };
    }
    const transcript = { before: before.text };
    switch (plan) {
        case 'transcript':
            return { transcript, status: false };
        case 'status':
            return { transcript: null, status: true };
        case 'either':
            return { transcript, status: true };
        default: {
            const exhaustive: never = plan;
            return exhaustive;
        }
    }
}

export class HandoffConfirmation {
    private readonly deps: ConfirmationDeps;

    constructor(deps: ConfirmationDeps) {
        this.deps = deps;
    }

    private async sessionOf(lane: Lane): Promise<Lane> {
        const current = await this.deps.session(String(lane.pane));
        return typeof current === 'string' && current.trim() !== '' ? { ...lane, session: sessionId(current) } : lane;
    }

    private async latestOf(lane: Lane): Promise<{ readonly lane: Lane; readonly latest: Latest }> {
        const current = await this.sessionOf(lane);
        const reader = this.deps.transcripts.readerFor(String(lane.agent));
        const located = reader === undefined ? null : await reader.locate(current);
        if (reader === undefined || located === null || located.kind !== 'located') {
            return { lane: current, latest: { kind: 'prompt', text: null } };
        }
        const prompt = await reader.latestPrompt(located.source, HANDOFF_PROMPT_TAIL_BYTES);
        return { lane: current, latest: isUnknown(prompt) ? { kind: 'unreadable' } : { kind: 'prompt', text: prompt.text } };
    }

    async baseline(target: Ready): Promise<Baseline> {
        if (!target.ownTranscript) {
            return { lane: target.lane, before: { kind: 'none' } };
        }
        const read = await this.latestOf(target.lane);
        return { lane: read.lane, before: read.latest.kind === 'prompt' ? { kind: 'prompt', text: read.latest.text } : { kind: 'none' } };
    }

    private async observe(lane: Lane, evidence: Evidence, prefix: string): Promise<Observed> {
        let current = lane;
        if (evidence.transcript !== null) {
            const read = await this.latestOf(lane);
            current = read.lane;
            if (read.latest.kind === 'prompt' && read.latest.text !== null && read.latest.text !== evidence.transcript.before && collapsedText(read.latest.text, 'space').startsWith(prefix)) {
                return { lane: current, confirmed: true };
            }
        }
        if (evidence.status) {
            const state = await this.deps.agents.status(String(lane.pane));
            if (state.kind === 'agent' && state.status === 'working') {
                return { lane: current, confirmed: true };
            }
        }
        return { lane: current, confirmed: false };
    }

    async confirm(target: Ready, baseline: Baseline, text: string): Promise<HandoffOutcome> {
        const evidence = evidenceOf(target.plan.evidence, baseline.before);
        const prefix = prefixOf(text);
        let lane = baseline.lane;
        for (let observation = 0; observation < HANDOFF_OBSERVATIONS; observation += 1) {
            await this.deps.pause(HANDOFF_OBSERVE_MS);
            try {
                const seen = await this.observe(lane, evidence, prefix);
                lane = seen.lane;
                if (seen.confirmed) {
                    return { kind: 'delivered' };
                }
            } catch {
                return { kind: 'failed', reason: 'unconfirmed' };
            }
        }
        return { kind: 'failed', reason: 'unconfirmed' };
    }
}
