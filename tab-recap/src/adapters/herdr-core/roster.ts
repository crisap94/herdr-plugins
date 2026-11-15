import { parsePaneId } from '#src/recap/domain/ids.ts';
import type { PaneId } from '#src/recap/domain/ids.ts';
import type { SeenLane } from '#src/recap/domain/lane.ts';
import { parseNonEmptyText } from '#src/recap/domain/text.ts';
import type { Frame } from '#src/ports/fleet-source.ts';
import { CoreRoster, parseHcAddress } from './sdk-core.ts';
import type { Count as CoreCount, HcCoreFeed, HcPayload, HcTerminal } from './sdk-core.ts';
import { framesBetween } from './frames.ts';
import { agentOfApp } from './kinds.ts';
import { seenOfHcTerminal } from './seen.ts';
import type { SessionOfTerminal } from './sessions.ts';

export class HcCoreRoster {
    private readonly core = new CoreRoster();
    private readonly cache = new WeakMap<HcTerminal, SeenLane | null>();
    private readonly sessions: SessionOfTerminal;
    private known: readonly SeenLane[] = [];

    constructor(sessions: SessionOfTerminal) {
        this.sessions = sessions;
    }

    get revision(): CoreCount {
        return this.core.revision;
    }

    load(terminals: readonly HcPayload[]): void {
        this.core.load(terminals);
        this.known = this.derive();
    }

    loadIfCurrent(since: CoreCount, terminals: readonly HcPayload[]): void {
        if (this.core.loadIfCurrent(since, terminals) !== null) {
            this.known = this.derive();
        }
    }

    fold(feed: HcCoreFeed): readonly Frame[] {
        const step = this.core.fold(feed);
        const lanes = this.derive();
        const frames = step.initial ? [] : framesBetween(this.known, lanes);
        this.known = lanes;
        return frames;
    }

    lanes(): readonly SeenLane[] {
        return this.known;
    }

    panes(): readonly PaneId[] {
        return this.core.addresses().flatMap((address) => {
            const pane = parsePaneId(address);
            return pane.kind === 'ok' ? [pane.value] : [];
        });
    }

    terminal(pane: PaneId): HcTerminal | null {
        const address = parseHcAddress(pane);
        return address.kind === 'ok' ? this.core.get(address.value) : null;
    }

    private derive(): readonly SeenLane[] {
        return [...this.core.terminals.values()].flatMap((terminal) => {
            const lane = this.laneOf(terminal);
            return lane === null ? [] : [lane];
        });
    }

    private laneOf(terminal: HcTerminal): SeenLane | null {
        const cached = this.cache.get(terminal);
        if (cached !== undefined) {
            return cached;
        }
        const app = parseNonEmptyText(terminal.app);
        const agent = app.kind === 'ok' ? agentOfApp(app.value) : null;
        if (agent === null) {
            this.cache.set(terminal, null);
            return null;
        }
        const session = this.sessions(terminal);
        const lane = seenOfHcTerminal(terminal, session, agent);
        if (session !== null) {
            this.cache.set(terminal, lane);
        }
        return lane;
    }
}
