import { laneStatus } from '#src/recap/domain/status.ts';
import type { Agents, AgentState, Prompted } from '#src/ports/agents.ts';
import type { Done } from '#src/ports/columns.ts';
import { unknown } from '#src/ports/unknowable.ts';
import type { Unknown } from '#src/ports/unknowable.ts';
import type { PaneId } from '#src/recap/domain/ids.ts';
import type { HcAddresses, HcTerminals } from '#src/recap/domain/hc-terminal.ts';

export interface HcTerminalListing {
    readonly kind: 'listing';
    readonly terminals: HcTerminals;
    readonly addresses: HcAddresses;
}

export type HcListing = HcTerminalListing | Unknown;

export type HcLookup = () => Promise<HcListing>;

const NO_TYPING = 'the desktop app cannot type into an agent yet';

export class HcAgents implements Agents {
    private readonly lookup: HcLookup;

    constructor(lookup: HcLookup) {
        this.lookup = lookup;
    }

    async status(pane: PaneId): Promise<AgentState> {
        const found = await this.lookup();
        if (found.kind !== 'listing') {
            return found;
        }
        const terminal = found.terminals.find((candidate) => candidate.address === pane);
        return terminal === undefined ? unknown({ why: 'not-found', what: `agent ${pane}` }) : { kind: 'agent', agent: terminal.app, status: laneStatus(terminal.status) };
    }

    prompt(): Promise<Prompted> {
        return Promise.resolve(unknown({ why: 'unreachable', detail: NO_TYPING }));
    }

    typeLine(): Promise<Prompted> {
        return Promise.resolve(unknown({ why: 'unreachable', detail: NO_TYPING }));
    }

    askNote(): Promise<Done> {
        return Promise.resolve(unknown({ why: 'unreachable', detail: NO_TYPING }));
    }
}
