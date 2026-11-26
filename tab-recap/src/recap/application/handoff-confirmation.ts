import { must } from '@stateforge-labs/session-ledger';
import type { AgentPanes } from '#src/ports/agents.ts';
import type { TranscriptRegistry } from '@stateforge-labs/session-ledger';
import { isUnknown } from '@stateforge-labs/session-ledger';
import { parseSessionId } from '#src/recap/domain/ids.ts';
import { duration, type Duration } from '@stateforge-labs/session-ledger';
import type { HandoffOutcome } from '#src/recap/domain/handoff-outcome.ts';
import type { HandoffEvidence } from '#src/recap/domain/handoff-plan.ts';
import { seatOf, type FollowedSession } from '#src/recap/domain/lane.ts';
import { failureCauseOf, parseThrown } from '@stateforge-labs/session-ledger';
import { collapsedText } from '#src/recap/domain/text-collapse.ts';
import { textOf, type Text } from '@stateforge-labs/session-ledger';
import type { CurrentSession } from './lane-recent.ts';
import type { Ready } from './handoff-target.ts';
import { HANDOFF_OBSERVATIONS, HANDOFF_OBSERVE_MS, HANDOFF_PREFIX_CODE_POINTS, HANDOFF_PROMPT_TAIL_BYTES } from './handoff-limits.ts';

export type Before = { readonly kind: 'prompt'; readonly text: Text | null } | { readonly kind: 'none' };

export interface Baseline {
    readonly lane: FollowedSession;
    readonly before: Before;
}

interface TranscriptBefore {
    readonly before: Text | null;
}

interface Evidence {
    readonly transcript: TranscriptBefore | null;
    readonly status: StatusWatch;
}

interface LatestOf {
    readonly lane: FollowedSession;
    readonly latest: Latest;
}

interface Observed {
    readonly lane: FollowedSession;
    readonly confirmed: Confirmation;
}

type StatusWatch = 'watched' | 'unwatched';

type Confirmation = 'confirmed' | 'pending';

type Latest = { readonly kind: 'prompt'; readonly text: Text | null } | { readonly kind: 'unreadable' };

export interface ConfirmationDeps {
    readonly agents: Pick<AgentPanes, 'status'>;
    readonly transcripts: TranscriptRegistry;
    readonly session: CurrentSession;
    readonly pause: (span: Duration) => Promise<void>;
    readonly log: (line: Text) => void;
}

const prefixOf = (text: Text): Text => collapsedText(textOf(Array.from(text).slice(0, HANDOFF_PREFIX_CODE_POINTS).join('')), 'space');

function evidenceOf(plan: HandoffEvidence, before: Before): Evidence {
    if (before.kind === 'none') {
        return { transcript: null, status: 'watched' };
    }
    const transcript = { before: before.text };
    switch (plan) {
        case 'transcript':
            return { transcript, status: 'unwatched' };
        case 'status':
            return { transcript: null, status: 'watched' };
        case 'either':
            return { transcript, status: 'watched' };
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

    private async sessionOf(lane: FollowedSession): Promise<FollowedSession> {
        const current = await this.deps.session(lane.pane);
        return typeof current === 'string' && current.trim() !== '' ? { ...lane, session: must(parseSessionId(current)) } : lane;
    }

    private async latestOf(lane: FollowedSession): Promise<LatestOf> {
        const current = await this.sessionOf(lane);
        const reader = this.deps.transcripts.readerFor(lane.agent);
        const located = reader === undefined ? null : await reader.locate(seatOf(current));
        if (reader === undefined || located === null || located.kind !== 'located') {
            return { lane: current, latest: { kind: 'prompt', text: null } };
        }
        const prompt = await reader.latestPrompt(located.source, HANDOFF_PROMPT_TAIL_BYTES);
        return { lane: current, latest: isUnknown(prompt) ? { kind: 'unreadable' } : { kind: 'prompt', text: prompt.text } };
    }

    async baseline(target: Ready): Promise<Baseline> {
        if (target.transcript === 'shared') {
            return { lane: target.lane, before: { kind: 'none' } };
        }
        const read = await this.latestOf(target.lane);
        return { lane: read.lane, before: read.latest.kind === 'prompt' ? { kind: 'prompt', text: read.latest.text } : { kind: 'none' } };
    }

    private async observe(lane: FollowedSession, evidence: Evidence, prefix: Text): Promise<Observed> {
        let current = lane;
        if (evidence.transcript !== null) {
            const read = await this.latestOf(lane);
            current = read.lane;
            if (read.latest.kind === 'prompt' && read.latest.text !== null && read.latest.text !== evidence.transcript.before && collapsedText(read.latest.text, 'space').startsWith(prefix)) {
                return { lane: current, confirmed: 'confirmed' };
            }
        }
        if (evidence.status === 'watched') {
            const state = await this.deps.agents.status(lane.pane);
            if (state.kind === 'agent' && state.status === 'working') {
                return { lane: current, confirmed: 'confirmed' };
            }
        }
        return { lane: current, confirmed: 'pending' };
    }

    async confirm(target: Ready, baseline: Baseline, text: Text): Promise<HandoffOutcome> {
        const evidence = evidenceOf(target.plan.evidence, baseline.before);
        const prefix = prefixOf(text);
        let lane = baseline.lane;
        for (let observation = 0; observation < HANDOFF_OBSERVATIONS; observation += 1) {
            await this.deps.pause(duration(HANDOFF_OBSERVE_MS));
            try {
                const seen = await this.observe(lane, evidence, prefix);
                lane = seen.lane;
                if (seen.confirmed === 'confirmed') {
                    return { kind: 'delivered' };
                }
            } catch (error) {
                this.deps.log(textOf(`handoff observe ${target.lane.pane}: ${failureCauseOf(parseThrown(error))}`));
                return { kind: 'failed', reason: 'unconfirmed' };
            }
        }
        return { kind: 'failed', reason: 'unconfirmed' };
    }
}
