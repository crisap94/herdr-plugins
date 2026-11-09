import { laneStatus } from '#src/recap/domain/status.ts';
import type { Agents, AgentState, Prompted } from '#src/ports/agents.ts';
import type { Done } from '#src/ports/columns.ts';
import { unknown } from '#src/ports/unknowable.ts';
import type { Unknown } from '#src/ports/unknowable.ts';
import type { PaneId } from '#src/recap/domain/ids.ts';
import type { HcTerminal } from '#src/recap/domain/hc-terminal.ts';
import { HC_NO_TYPING } from '../desktop/constants.ts';

export interface HcSeen {
    readonly kind: 'seen';
    readonly terminal: HcTerminal | null;
}

export type HcSeenResult = HcSeen | Unknown;

export type HcSeenLookup = (pane: PaneId) => Promise<HcSeenResult>;

export class HcCoreAgents implements Agents {
    private readonly lookup: HcSeenLookup;

    constructor(lookup: HcSeenLookup) {
        this.lookup = lookup;
    }

    async status(pane: PaneId): Promise<AgentState> {
        const found = await this.lookup(pane);
        if (found.kind !== 'seen') {
            return found;
        }
        const terminal = found.terminal;
        return terminal === null ? unknown({ why: 'not-found', what: `agent ${pane}` }) : { kind: 'agent', agent: terminal.app, status: laneStatus(terminal.status) };
    }

    prompt(): Promise<Prompted> {
        return Promise.resolve(unknown({ why: 'unreachable', detail: HC_NO_TYPING }));
    }

    typeLine(): Promise<Prompted> {
        return Promise.resolve(unknown({ why: 'unreachable', detail: HC_NO_TYPING }));
    }

    askNote(): Promise<Done> {
        return Promise.resolve(unknown({ why: 'unreachable', detail: HC_NO_TYPING }));
    }
}
