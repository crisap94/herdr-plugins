import { laneStatus } from '#src/recap/domain/status.ts';
import type { AgentPanes, AgentLookup, Prompted } from '#src/ports/agents.ts';
import type { Done } from '#src/ports/columns.ts';
import { unknown } from '#src/ports/unknowable.ts';
import type { Unknown } from '#src/ports/unknowable.ts';
import { must } from '#src/protocol/result.ts';
import { causeOf } from '#src/recap/domain/failure-cause.ts';
import { parseAgentKind, type PaneId } from '#src/recap/domain/ids.ts';
import { parseText, textOf } from '#src/recap/domain/text.ts';
import type { HcTerminal } from './sdk-core.ts';
import { HC_NO_TYPING } from '../desktop/constants.ts';

export interface HcSeen {
    readonly kind: 'seen';
    readonly terminal: HcTerminal | null;
}

export type HcSeenResult = HcSeen | Unknown;

export type HcSeenLookup = (pane: PaneId) => Promise<HcSeenResult>;

export class HcCoreAgents implements AgentPanes {
    private readonly lookup: HcSeenLookup;

    constructor(lookup: HcSeenLookup) {
        this.lookup = lookup;
    }

    async status(pane: PaneId): Promise<AgentLookup> {
        const found = await this.lookup(pane);
        if (found.kind !== 'seen') {
            return found;
        }
        const terminal = found.terminal;
        if (terminal === null) {
            return unknown({ why: 'not-found', what: textOf(`agent ${pane}`) });
        }
        const agent = parseAgentKind(terminal.app);
        return agent.kind === 'ok' ? { kind: 'agent', agent: agent.value, status: laneStatus(textOf(terminal.status)) } : unknown({ why: 'unreadable', detail: causeOf(must(parseText(`terminal ${pane} reports no agent`))) });
    }

    prompt(): Promise<Prompted> {
        return Promise.resolve(unknown({ why: 'unreachable', detail: causeOf(must(parseText(HC_NO_TYPING))) }));
    }

    typeLine(): Promise<Prompted> {
        return Promise.resolve(unknown({ why: 'unreachable', detail: causeOf(must(parseText(HC_NO_TYPING))) }));
    }

    askNote(): Promise<Done> {
        return Promise.resolve(unknown({ why: 'unreachable', detail: causeOf(must(parseText(HC_NO_TYPING))) }));
    }
}
